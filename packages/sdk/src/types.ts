export type SpanType = "agent" | "llm" | "tool" | "api" | "database" | "retrieval" | "custom";

export interface TokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface ErrorDetails {
  type?: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface TraceStartEvent {
  type: "trace.start";
  eventId?: string;
  id: string;
  name: string;
  agentName?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  isDemo?: boolean;
}

export interface TraceEndEvent {
  type: "trace.end";
  eventId?: string;
  id: string;
  timestamp: string;
  status: "success" | "error" | "cancelled";
  metadata?: Record<string, unknown>;
  error?: ErrorDetails;
}

export interface SpanStartEvent {
  type: "span.start";
  eventId?: string;
  id: string;
  traceId: string;
  parentSpanId?: string | null;
  name: string;
  spanType: SpanType;
  timestamp: string;
  model?: string;
  provider?: string;
  input?: unknown;
  attributes?: Record<string, unknown>;
  tags?: string[];
  attemptNumber?: number;
}

export interface SpanEndEvent {
  type: "span.end";
  eventId?: string;
  id: string;
  traceId: string;
  timestamp: string;
  status: "success" | "error" | "cancelled";
  output?: unknown;
  error?: ErrorDetails;
  tokenUsage?: TokenUsage;
  attributes?: Record<string, unknown>;
  tags?: string[];
}

export interface SpanEvent {
  type: "span.event";
  eventId?: string;
  id: string;
  traceId: string;
  spanId: string;
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

export type IngestEvent =
  | TraceStartEvent
  | TraceEndEvent
  | SpanStartEvent
  | SpanEndEvent
  | SpanEvent;
