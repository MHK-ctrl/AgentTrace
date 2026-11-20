export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDemo: boolean;
  createdAt: string;
  traceCount: number;
  lastTraceAt: string | null;
}

export interface TraceListItem {
  id: string;
  name: string;
  agentName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  spanCount: number;
  errorCount: number;
  isDemo: boolean;
  costUsd: number | null;
  costComplete: boolean;
  metadata: Record<string, unknown>;
}

export interface TraceListResponse {
  traces: TraceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface SpanError {
  type?: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface SpanEvent {
  id: string;
  traceId: string;
  spanId: string;
  name: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  projectId: string;
  parentSpanId: string | null;
  operationName: string;
  operationType: string;
  status: string;
  model: string | null;
  provider: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  inputPayload: unknown;
  outputPayload: unknown;
  errorDetails: SpanError | null;
  tokenUsage: TokenUsage | null;
  attemptNumber: number;
  attributes: Record<string, unknown>;
  tags: string[];
  costUsd: number | null;
  costAvailable: boolean;
  events: SpanEvent[];
}

export interface TraceSummary {
  id: string;
  projectId: string;
  name: string;
  agentName: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  tags: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  spanCount: number;
  errorCount: number;
  isDemo: boolean;
  costUsd: number | null;
  costComplete: boolean;
  unknownModels: string[];
}

export interface TraceDetailResponse {
  trace: TraceSummary;
  spans: Span[];
  cost: {
    costUsd: number | null;
    costComplete: boolean;
    pricedTokens: number;
    unpricedTokens: number;
  };
}

export interface ModelUsage {
  model: string;
  provider: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  errors: number;
  costUsd: number | null;
  costAvailable: boolean;
}

export interface OverviewResponse {
  totals: {
    traces: number;
    success: number;
    failed: number;
    running: number;
    cancelled: number;
    completed: number;
    successRate: number | null;
    avgDurationMs: number | null;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number | null;
    costComplete: boolean;
    unpricedTokens: number;
  };
  timeseries: Array<{
    bucket: string;
    total: number;
    success: number;
    failed: number;
    avgDurationMs: number | null;
    tokens: number;
  }>;
  models: ModelUsage[];
  failingTools: Array<{
    operationName: string;
    operationType: string;
    failures: number;
    affectedTraces: number;
    lastSeen: string;
  }>;
  durations: Array<{ label: string; count: number }>;
  bucket: "hour" | "day";
}

export interface ErrorGroup {
  id: string;
  operationName: string;
  operationType: string;
  errorType: string;
  message: string;
  occurrences: number;
  affectedTraces: number;
  affectedAgents: string[];
  firstSeen: string;
  lastSeen: string;
  sampleTraceId: string;
  sampleSpanId: string;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface PricingRule {
  id: string;
  projectId: string;
  model: string;
  provider: string;
  inputPricePerToken: string;
  outputPricePerToken: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShareSummary {
  id: string;
  traceId: string;
  label: string | null;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  status: "active" | "expired" | "revoked";
}

export interface FilterOptions {
  agents: string[];
  models: string[];
  tools: string[];
}

export interface RealtimeEvent {
  type:
    | "trace.started"
    | "trace.completed"
    | "span.started"
    | "span.completed"
    | "span.event";
  traceId: string;
  [key: string]: unknown;
}
