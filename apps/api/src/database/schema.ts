import type { SpanType, TraceStatus } from "@agenttrace/shared";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export interface SpanErrorDetails {
  type?: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface SpanTokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  isDemo: boolean("is_demo").notNull().default(false),
  /** Ephemeral anonymous demo workspace, never listed in the owner console. */
  isPublicDemo: boolean("is_public_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    hashedKey: text("hashed_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_keys_hashed_key_idx").on(table.hashedKey),
    index("api_keys_project_idx").on(table.projectId),
  ],
);

export const traces = pgTable(
  "traces",
  {
    id: text("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    agentName: text("agent_name"),
    status: text("status").$type<TraceStatus>().notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    spanCount: integer("span_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("traces_project_started_idx").on(table.projectId, table.startedAt.desc()),
    index("traces_status_idx").on(table.status),
    index("traces_agent_idx").on(table.agentName),
    index("traces_name_idx").on(table.name),
  ],
);

/**
 * parent_span_id intentionally has no foreign key: events may arrive out of
 * order, and a child must not fail ingestion because its parent is late.
 */
export const spans = pgTable(
  "spans",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentSpanId: text("parent_span_id"),
    operationName: text("operation_name").notNull(),
    operationType: text("operation_type").$type<SpanType>().notNull().default("custom"),
    status: text("status").$type<TraceStatus>().notNull().default("running"),
    model: text("model"),
    provider: text("provider"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    inputPayload: jsonb("input_payload").$type<unknown>(),
    outputPayload: jsonb("output_payload").$type<unknown>(),
    errorDetails: jsonb("error_details").$type<SpanErrorDetails>(),
    tokenUsage: jsonb("token_usage").$type<SpanTokenUsage>(),
    attemptNumber: integer("attempt_number").notNull().default(1),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("spans_trace_idx").on(table.traceId, table.startedAt),
    index("spans_project_started_idx").on(table.projectId, table.startedAt.desc()),
    index("spans_parent_idx").on(table.parentSpanId),
    index("spans_model_idx").on(table.model),
    index("spans_type_idx").on(table.operationType),
    index("spans_status_idx").on(table.status),
  ],
);

export const spanEvents = pgTable(
  "span_events",
  {
    id: text("id").primaryKey(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    spanId: text("span_id")
      .notNull()
      .references(() => spans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("span_events_span_idx").on(table.spanId),
    index("span_events_trace_idx").on(table.traceId),
  ],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    provider: text("provider").notNull().default("any"),
    inputPricePerToken: numeric("input_price_per_token", { precision: 20, scale: 12 })
      .notNull()
      .default("0"),
    outputPricePerToken: numeric("output_price_per_token", { precision: 20, scale: 12 })
      .notNull()
      .default("0"),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pricing_project_model_provider_idx").on(
      table.projectId,
      table.model,
      table.provider,
    ),
    index("pricing_project_idx").on(table.projectId),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    label: text("label"),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_idx").on(table.tokenHash),
    index("share_links_trace_idx").on(table.traceId),
  ],
);

export const demoSessions = pgTable(
  "demo_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    runCount: integer("run_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("demo_sessions_token_hash_idx").on(table.tokenHash),
    index("demo_sessions_expires_idx").on(table.expiresAt),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type TraceRow = typeof traces.$inferSelect;
export type SpanRow = typeof spans.$inferSelect;
export type SpanEventRow = typeof spanEvents.$inferSelect;
export type PricingRuleRow = typeof pricingRules.$inferSelect;
export type ShareLinkRow = typeof shareLinks.$inferSelect;
export type DemoSessionRow = typeof demoSessions.$inferSelect;
