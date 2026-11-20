import type { SpanType, TokenUsage } from "./types.js";

export interface RedactionOptions {
  /** Extra object keys to redact (case-insensitive). */
  keys?: string[];
  /** Extra regular expressions applied to string values. */
  patterns?: RegExp[];
  replacement?: string;
}

export interface AgentTraceOptions {
  /** Project ingestion key. */
  apiKey: string;
  /** AgentTrace API base URL. Defaults to http://localhost:4000 */
  endpoint?: string;
  /** Optional label included in trace metadata; the API key selects the project. */
  projectId?: string;
  /** Capture (redacted) span inputs and outputs. Default false. */
  captureInputOutput?: boolean;
  /** Maximum serialized payload size in bytes. Default 16 KiB. */
  captureMaxBytes?: number;
  /** Automatic flush interval. Default 2000ms. */
  flushIntervalMs?: number;
  /** Max events per network batch. Default 100. */
  maxBatchSize?: number;
  /** Max queued events before dropping oldest. Default 5000. */
  maxQueueSize?: number;
  /** Per-request timeout. Default 10000ms. */
  requestTimeoutMs?: number;
  /** Retry attempts for retriable failures. Default 3. */
  retries?: number;
  /** When true (default), ingestion failures never throw into the host app. */
  failOpen?: boolean;
  /** Enable SDK diagnostics on stderr. Default false. */
  debug?: boolean;
  /** Custom redaction rules applied before payloads leave the process. */
  redaction?: RedactionOptions;
  /** Tags applied to every trace. */
  tags?: string[];
  /** Called when a batch permanently fails. Receives a safe message only. */
  onError?: (error: Error) => void;
}

export interface TraceOptions {
  name: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  /** Mark the trace as sample/demo data. */
  isDemo?: boolean;
  captureInputOutput?: boolean;
}

export interface SpanOptions {
  name: string;
  type?: SpanType;
  model?: string;
  provider?: string;
  /** Captured only when captureInputOutput is enabled. */
  input?: unknown;
  attributes?: Record<string, unknown>;
  tags?: string[];
  tokenUsage?: TokenUsage;
  attemptNumber?: number;
  captureInputOutput?: boolean;
  /** Return undefined instead of rethrowing an error from this span. */
  swallowErrors?: boolean;
}

export interface TraceHandle {
  readonly id: string;
  readonly name: string;
  span<T>(options: SpanOptions, fn: (span: SpanHandle) => Promise<T> | T): Promise<T>;
  llm<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T>;
  tool<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T>;
  api<T>(options: Omit<SpanOptions, "type">, fn: (span: SpanHandle) => Promise<T> | T): Promise<T>;
  database<T>(
    options: Omit<SpanOptions, "type">,
    fn: (span: SpanHandle) => Promise<T> | T,
  ): Promise<T>;
  retrieval<T>(
    options: Omit<SpanOptions, "type">,
    fn: (span: SpanHandle) => Promise<T> | T,
  ): Promise<T>;
  /** Record a custom event on the active span. */
  event(name: string, attributes?: Record<string, unknown>): void;
  /** Merge metadata sent with trace.end. */
  setMetadata(metadata: Record<string, unknown>): void;
  /** Manually end a trace started with startTrace(). */
  end(status?: "success" | "error" | "cancelled", error?: unknown): void;
}

export interface SpanHandle {
  readonly id: string;
  readonly traceId: string;
  readonly name: string;
  readonly type: SpanType;
  /** Record provider-reported token usage on the active span. */
  recordUsage(usage: TokenUsage): void;
  /** Merge attributes onto the active span. */
  setAttributes(attributes: Record<string, unknown>): void;
  /** Override the value captured as the span output. */
  setOutput(output: unknown): void;
  /** Record a point-in-time event on the active span. */
  event(name: string, attributes?: Record<string, unknown>): void;
}
