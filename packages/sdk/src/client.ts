import { AsyncLocalStorage } from "node:async_hooks";
import { createId, normalizeUsage, nowIso, serializeError, serializePayload } from "./events.js";
import { createRedactor, type Redactor } from "./redact.js";
import type {
  AgentTraceOptions,
  SpanHandle,
  SpanOptions,
  TraceHandle,
  TraceOptions,
} from "./public-types.js";
import type { IngestEvent, SpanType, TokenUsage } from "./types.js";

export const SDK_VERSION = "0.1.0";

const DEFAULT_ENDPOINT = "http://localhost:4000";
const MAX_METADATA_BYTES = 32 * 1024;

interface SpanState {
  id: string;
  name: string;
  type: SpanType;
  usage: TokenUsage | undefined;
  attributes: Record<string, unknown>;
  outputOverride: unknown;
  hasOutputOverride: boolean;
  ended: boolean;
}

interface InternalTraceState {
  id: string;
  name: string;
  ended: boolean;
  metadata: Record<string, unknown>;
  captureInputOutput: boolean;
  rootStore: Store;
}

interface Store {
  trace: InternalTraceState;
  spanId: string | null;
  spanState: SpanState | null;
}

class AgentTraceTransportError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
  ) {
    super(message);
    this.name = "AgentTraceTransportError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags?.length) return undefined;
  return tags.filter((tag) => typeof tag === "string" && tag.length > 0).slice(0, 50);
}

export class AgentTrace {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly captureInputOutput: boolean;
  private readonly captureMaxBytes: number;
  private readonly flushIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly maxQueueSize: number;
  private readonly requestTimeoutMs: number;
  private readonly retries: number;
  private readonly failOpen: boolean;
  private readonly debug: boolean;
  private readonly defaultTags: string[] | undefined;
  private readonly projectId: string | undefined;
  private readonly onError: ((error: Error) => void) | undefined;
  private readonly redactor: Redactor;
  private readonly als = new AsyncLocalStorage<Store>();

  private queue: IngestEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;
  private closed = false;
  private droppedCount = 0;

  constructor(options: AgentTraceOptions) {
    if (!options || typeof options.apiKey !== "string" || options.apiKey.trim().length === 0) {
      throw new Error("AgentTrace: apiKey is required");
    }
    this.apiKey = options.apiKey.trim();
    const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
      this.endpoint = endpoint.replace(/\/+$/, "");
    } catch {
      throw new Error(`AgentTrace: invalid endpoint "${endpoint}"`);
    }

    this.captureInputOutput = options.captureInputOutput ?? false;
    this.captureMaxBytes = clamp(options.captureMaxBytes ?? 16 * 1024, 512, 1024 * 1024);
    this.flushIntervalMs = clamp(options.flushIntervalMs ?? 2_000, 100, 60_000);
    this.maxBatchSize = clamp(options.maxBatchSize ?? 100, 1, 1_000);
    this.maxQueueSize = clamp(options.maxQueueSize ?? 5_000, 10, 100_000);
    this.requestTimeoutMs = clamp(options.requestTimeoutMs ?? 10_000, 250, 120_000);
    this.retries = clamp(options.retries ?? 3, 0, 10);
    this.failOpen = options.failOpen ?? true;
    this.debug = options.debug ?? false;
    this.defaultTags = sanitizeTags(options.tags);
    this.projectId = options.projectId;
    this.onError = options.onError;
    this.redactor = createRedactor(options.redaction);

    this.timer = setInterval(() => {
      void this.flush().catch((error: unknown) => {
        this.log("background flush failed", error);
      });
    }, this.flushIntervalMs);
    // Never keep the host process alive just for telemetry.
    this.timer.unref?.();
  }

  /** Run a callback as a traced operation. Errors are recorded and rethrown. */
  async trace<T>(options: TraceOptions, fn: (trace: TraceHandle) => Promise<T> | T): Promise<T> {
    const state = this.createTraceState(options);
    const handle = new TraceRecorder(this, state);

    try {
      const result = await this.als.run(state.rootStore, () => fn(handle));
      this.finishTrace(state, "success");
      return result;
    } catch (error) {
      this.finishTrace(state, "error", error);
      throw error;
    }
  }

  /**
   * Manually start a trace using AsyncLocalStorage.enterWith. Prefer trace()
   * for automatic lifecycle and error handling.
   */
  startTrace(options: TraceOptions): TraceHandle {
    const state = this.createTraceState(options);
    this.als.enterWith(state.rootStore);
    return new TraceRecorder(this, state);
  }

  /** Force-send all queued events. Rejects only when failOpen is false. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  /** Flush pending events and stop the interval timer. */
  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /** Diagnostics for tests and advanced integrations. */
  getStats(): { queued: number; dropped: number; closed: boolean } {
    return { queued: this.queue.length, dropped: this.droppedCount, closed: this.closed };
  }

  /** @internal */
  async runSpan<T>(
    rootStore: Store,
    options: SpanOptions,
    fn: (span: SpanHandle) => Promise<T> | T,
    forcedType?: SpanType,
  ): Promise<T> {
    if (!options?.name || typeof options.name !== "string") {
      throw new Error("AgentTrace: span name is required");
    }
    const store = this.als.getStore() ?? rootStore;
    const spanId = createId("span");
    const type = forcedType ?? options.type ?? "custom";
    const capture = options.captureInputOutput ?? store.trace.captureInputOutput;
    const attributes = this.prepareAttributes(options.attributes);
    const tags = sanitizeTags(options.tags);

    this.enqueue({
      type: "span.start",
      id: spanId,
      traceId: store.trace.id,
      parentSpanId: store.spanId,
      name: options.name,
      spanType: type,
      timestamp: nowIso(),
      ...(options.model ? { model: options.model } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(capture && options.input !== undefined
        ? { input: this.preparePayload(options.input) }
        : {}),
      ...(attributes ? { attributes } : {}),
      ...(tags ? { tags } : {}),
      ...(options.attemptNumber && options.attemptNumber > 1
        ? { attemptNumber: options.attemptNumber }
        : {}),
    });

    const spanState: SpanState = {
      id: spanId,
      name: options.name,
      type,
      usage: normalizeUsage(options.tokenUsage),
      attributes: attributes ?? {},
      outputOverride: undefined,
      hasOutputOverride: false,
      ended: false,
    };
    const childStore: Store = { ...store, spanId, spanState };
    const handle = new SpanRecorder(this, spanState, store.trace.id);

    try {
      const result = await this.als.run(childStore, () => fn(handle));
      if (!spanState.ended) {
        const output = spanState.hasOutputOverride ? spanState.outputOverride : result;
        this.finishSpan(store.trace.id, spanState, "success", capture ? output : undefined);
      }
      return result;
    } catch (error) {
      if (!spanState.ended) {
        this.finishSpan(store.trace.id, spanState, "error", undefined, error);
      }
      if (options.swallowErrors) return undefined as T;
      throw error;
    }
  }

  /** @internal */
  finishSpan(
    traceId: string,
    spanState: SpanState,
    status: "success" | "error" | "cancelled",
    output?: unknown,
    error?: unknown,
  ): void {
    if (spanState.ended) return;
    spanState.ended = true;
    const serializedError = error === undefined ? undefined : serializeError(error);
    this.enqueue({
      type: "span.end",
      id: spanState.id,
      traceId,
      timestamp: nowIso(),
      status,
      ...(output !== undefined ? { output: this.preparePayload(output) } : {}),
      ...(serializedError
        ? {
            error: {
              ...serializedError,
              message: this.redactor.redactString(serializedError.message),
              ...(serializedError.stack
                ? { stack: this.redactor.redactString(serializedError.stack) }
                : {}),
            },
          }
        : {}),
      ...(spanState.usage ? { tokenUsage: spanState.usage } : {}),
      ...(Object.keys(spanState.attributes).length > 0
        ? { attributes: this.prepareAttributes(spanState.attributes) }
        : {}),
    });
  }

  /** @internal */
  finishTrace(
    state: InternalTraceState,
    status: "success" | "error" | "cancelled",
    error?: unknown,
  ): void {
    if (state.ended) return;
    state.ended = true;
    const serializedError = error === undefined ? undefined : serializeError(error);
    this.enqueue({
      type: "trace.end",
      id: state.id,
      timestamp: nowIso(),
      status,
      ...(Object.keys(state.metadata).length > 0
        ? { metadata: this.prepareMetadata(state.metadata) }
        : {}),
      ...(serializedError
        ? {
            error: {
              ...serializedError,
              message: this.redactor.redactString(serializedError.message),
              ...(serializedError.stack
                ? { stack: this.redactor.redactString(serializedError.stack) }
                : {}),
            },
          }
        : {}),
    });
  }

  /** @internal */
  recordSpanEvent(
    traceId: string,
    spanId: string | null,
    name: string,
    attributes?: Record<string, unknown>,
  ): void {
    if (!spanId) {
      this.log("trace.event() called outside of a span; event ignored");
      return;
    }
    const prepared = this.prepareAttributes(attributes);
    this.enqueue({
      type: "span.event",
      id: createId("evt"),
      traceId,
      spanId,
      name,
      timestamp: nowIso(),
      ...(prepared ? { attributes: prepared } : {}),
    });
  }

  /** @internal */
  getActiveSpanId(): string | null {
    return this.als.getStore()?.spanId ?? null;
  }

  /** @internal */
  mergeMetadata(state: InternalTraceState, metadata: Record<string, unknown>): void {
    state.metadata = { ...state.metadata, ...metadata };
  }

  private createTraceState(options: TraceOptions): InternalTraceState {
    if (!options?.name || typeof options.name !== "string") {
      throw new Error("AgentTrace: trace name is required");
    }
    const traceId = createId("trace");
    const metadata = this.prepareMetadata(options.metadata) ?? {};
    if (this.projectId) metadata.clientProjectId ??= this.projectId;

    const state: InternalTraceState = {
      id: traceId,
      name: options.name,
      ended: false,
      metadata,
      captureInputOutput: options.captureInputOutput ?? this.captureInputOutput,
      rootStore: undefined as unknown as Store,
    };
    const rootStore: Store = { trace: state, spanId: null, spanState: null };
    state.rootStore = rootStore;

    const tags = sanitizeTags([...(this.defaultTags ?? []), ...(options.tags ?? [])]);
    this.enqueue({
      type: "trace.start",
      id: traceId,
      name: options.name,
      timestamp: nowIso(),
      ...(options.agentName ? { agentName: options.agentName } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(options.isDemo ? { isDemo: true } : {}),
    });

    return state;
  }

  private preparePayload(value: unknown): unknown {
    if (value === undefined) return undefined;
    const redacted = this.redactor.redactValue(value);
    return serializePayload(redacted, this.captureMaxBytes);
  }

  private prepareMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;
    const redacted = this.redactor.redactValue(metadata);
    const serialized = serializePayload(redacted, MAX_METADATA_BYTES);
    if (serialized && typeof serialized === "object" && !Array.isArray(serialized)) {
      return serialized as Record<string, unknown>;
    }
    return { value: serialized };
  }

  private prepareAttributes(
    attributes: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!attributes) return undefined;
    const redacted = this.redactor.redactValue(attributes);
    if (redacted && typeof redacted === "object" && !Array.isArray(redacted)) {
      return redacted as Record<string, unknown>;
    }
    return { value: redacted };
  }

  private enqueue(event: IngestEvent): void {
    if (this.closed) {
      this.log("event dropped after shutdown", event.type);
      return;
    }
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.droppedCount += 1;
      this.log("queue full; dropped oldest event");
    }
    this.queue.push(event);
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.slice(0, this.maxBatchSize);
      try {
        await this.send(batch);
        const sent = new Set(batch);
        this.queue = this.queue.filter((event) => !sent.has(event));
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        const sent = new Set(batch);
        this.queue = this.queue.filter((event) => !sent.has(event));
        this.droppedCount += batch.length;
        this.log("batch dropped after retries", failure.message);
        this.onError?.(failure);
        if (!this.failOpen) throw failure;
        return;
      }
    }
  }

  private async send(batch: IngestEvent[]): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await fetch(`${this.endpoint}/v1/ingest/batch`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
            "user-agent": `agenttrace-sdk/${SDK_VERSION}`,
          },
          body: JSON.stringify({
            events: batch,
            sdk: { name: "agenttrace-sdk", version: SDK_VERSION },
          }),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });

        if (response.ok) return;
        const retriable = response.status === 429 || response.status >= 500;
        const message = `AgentTrace ingestion failed with HTTP ${response.status}`;
        lastError = new AgentTraceTransportError(message, retriable);
        if (!retriable) throw lastError;
      } catch (error) {
        if (
          error instanceof AgentTraceTransportError &&
          !error.retriable
        ) {
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < this.retries) {
        const backoff = Math.min(250 * 2 ** attempt, 5_000) + Math.floor(Math.random() * 100);
        this.log(`retrying batch in ${backoff}ms`, lastError?.message);
        await sleep(backoff);
      }
    }

    throw lastError ?? new Error("AgentTrace ingestion failed");
  }

  private log(message: string, detail?: unknown): void {
    if (!this.debug) return;
    const suffix = detail === undefined ? "" : `: ${String(detail)}`;
    console.warn(`[agenttrace] ${message}${suffix}`);
  }
}

class TraceRecorder implements TraceHandle {
  constructor(
    private readonly client: AgentTrace,
    private readonly state: InternalTraceState,
  ) {}

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  span<T>(options: SpanOptions, fn: (span: SpanHandle) => Promise<T> | T): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn);
  }

  llm<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn, "llm");
  }

  tool<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn, "tool");
  }

  api<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn, "api");
  }

  database<T>(
    options: Omit<SpanOptions, "type">,
    fn: (span: SpanHandle) => Promise<T> | T,
  ): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn, "database");
  }

  retrieval<T>(
    options: Omit<SpanOptions, "type">,
    fn: (span: SpanHandle) => Promise<T> | T,
  ): Promise<T> {
    return this.client.runSpan(this.state.rootStore, options, fn, "retrieval");
  }

  event(name: string, attributes?: Record<string, unknown>): void {
    this.client.recordSpanEvent(this.state.id, this.client.getActiveSpanId(), name, attributes);
  }

  setMetadata(metadata: Record<string, unknown>): void {
    this.client.mergeMetadata(this.state, metadata);
  }

  end(status: "success" | "error" | "cancelled" = "success", error?: unknown): void {
    this.client.finishTrace(this.state, status, error);
  }
}

class SpanRecorder implements SpanHandle {
  constructor(
    private readonly client: AgentTrace,
    private readonly spanState: SpanState,
    public readonly traceId: string,
  ) {}

  get id(): string {
    return this.spanState.id;
  }

  get name(): string {
    return this.spanState.name;
  }

  get type(): SpanType {
    return this.spanState.type;
  }

  recordUsage(usage: TokenUsage): void {
    const normalized = normalizeUsage(usage);
    if (!normalized) return;
    if (!this.spanState.usage) {
      this.spanState.usage = normalized;
      return;
    }
    const input = (this.spanState.usage.input ?? 0) + (normalized.input ?? 0);
    const output = (this.spanState.usage.output ?? 0) + (normalized.output ?? 0);
    this.spanState.usage = { input, output, total: input + output };
  }

  setAttributes(attributes: Record<string, unknown>): void {
    this.spanState.attributes = { ...this.spanState.attributes, ...attributes };
  }

  setOutput(output: unknown): void {
    this.spanState.outputOverride = output;
    this.spanState.hasOutputOverride = true;
  }

  event(name: string, attributes?: Record<string, unknown>): void {
    this.client.recordSpanEvent(this.traceId, this.spanState.id, name, attributes);
  }
}

let globalClient: AgentTrace | null = null;

/** Initialize a process-wide AgentTrace client. */
export function init(options: AgentTraceOptions): AgentTrace {
  globalClient = new AgentTrace(options);
  return globalClient;
}

export function getAgentTrace(): AgentTrace {
  if (!globalClient) {
    throw new Error("AgentTrace has not been initialized. Call init({ apiKey }) first.");
  }
  return globalClient;
}

/** Flush and shut down the process-wide client, if configured. */
export async function shutdown(): Promise<void> {
  if (!globalClient) return;
  await globalClient.shutdown();
  globalClient = null;
}
