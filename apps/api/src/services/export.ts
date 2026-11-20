import type { Database } from "../database/client.js";
import { escapeHtml, sanitizeAttributes, sanitizePayload, truncate } from "../utils/payload.js";
import type { PricingResolver } from "./pricing.js";
import { getTraceDetail } from "./traces.js";

export type ExportFormat = "json" | "md" | "html";

export interface ExportPayload {
  exportVersion: 1;
  exportedAt: string;
  disclaimer: string;
  trace: {
    id: string;
    name: string;
    agentName: string | null;
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    isDemo: boolean;
    tags: string[];
    metadata: unknown;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    costUsd: number | null;
    costComplete: boolean;
    unknownModels: string[];
  };
  spans: Array<{
    id: string;
    parentSpanId: string | null;
    name: string;
    type: string;
    status: string;
    model: string | null;
    provider: string | null;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    attemptNumber: number;
    input: unknown;
    output: unknown;
    error: unknown;
    tokens: unknown;
    costUsd: number | null;
    attributes: Record<string, unknown>;
    tags: string[];
    events: Array<{ name: string; timestamp: string; attributes: Record<string, unknown> }>;
  }>;
  cost: {
    costUsd: number | null;
    costComplete: boolean;
    pricedTokens: number;
    unpricedTokens: number;
  };
}

export async function buildTraceExport(
  db: Database,
  projectId: string,
  traceId: string,
  resolver: PricingResolver,
): Promise<ExportPayload> {
  const detail = await getTraceDetail(db, projectId, traceId, resolver);
  const trace = detail.trace;

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    disclaimer:
      "Costs are estimates calculated from user-configured per-token pricing and may differ from provider billing. Payloads are redacted and truncated by AgentTrace.",
    trace: {
      id: trace.id,
      name: trace.name,
      agentName: trace.agentName,
      status: trace.status,
      startedAt: trace.startedAt.toISOString(),
      completedAt: trace.completedAt ? trace.completedAt.toISOString() : null,
      durationMs: trace.durationMs,
      isDemo: trace.isDemo,
      tags: trace.tags,
      metadata: sanitizePayload(trace.metadata),
      totalInputTokens: trace.totalInputTokens,
      totalOutputTokens: trace.totalOutputTokens,
      totalTokens: trace.totalTokens,
      costUsd: trace.costUsd,
      costComplete: trace.costComplete,
      unknownModels: trace.unknownModels,
    },
    spans: detail.spans.map((span) => ({
      id: span.id,
      parentSpanId: span.parentSpanId,
      name: span.operationName,
      type: span.operationType,
      status: span.status,
      model: span.model,
      provider: span.provider,
      startedAt: span.startedAt.toISOString(),
      completedAt: span.completedAt ? span.completedAt.toISOString() : null,
      durationMs: span.durationMs,
      attemptNumber: span.attemptNumber,
      input: span.inputPayload === null ? null : sanitizePayload(span.inputPayload),
      output: span.outputPayload === null ? null : sanitizePayload(span.outputPayload),
      error: span.errorDetails,
      tokens: span.tokenUsage,
      costUsd: span.costUsd,
      attributes: sanitizeAttributes(span.attributes),
      tags: span.tags,
      events: span.events.map((event) => ({
        name: event.name,
        timestamp: event.timestamp.toISOString(),
        attributes: sanitizeAttributes(event.attributes),
      })),
    })),
    cost: detail.cost,
  };
}

function formatCost(value: number | null): string {
  if (value === null) return "Unavailable";
  return `$${value.toFixed(6)}`;
}

function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function jsonBlock(value: unknown): string {
  if (value === null || value === undefined) return "_Not captured_";
  let serialized: string;
  try {
    serialized = JSON.stringify(value, null, 2);
  } catch {
    serialized = String(value);
  }
  return `\`\`\`json\n${truncate(serialized, 4_000)}\n\`\`\``;
}

export function renderMarkdown(payload: ExportPayload): string {
  const { trace } = payload;
  const errors = payload.spans.filter((span) => span.status === "error");
  const lines: string[] = [
    `# AgentTrace report — ${trace.name}`,
    "",
    `> **${trace.isDemo ? "Sample data (synthetic demo trace)" : "Recorded trace"}**`,
    `> ${payload.disclaimer}`,
    "",
    "## Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Trace ID | \`${trace.id}\` |`,
    `| Agent | ${trace.agentName ?? "—"} |`,
    `| Status | ${trace.status} |`,
    `| Started | ${trace.startedAt} |`,
    `| Duration | ${trace.durationMs ?? "—"} ms |`,
    `| Spans | ${payload.spans.length} |`,
    `| Input tokens | ${trace.totalInputTokens} |`,
    `| Output tokens | ${trace.totalOutputTokens} |`,
    `| Estimated cost | ${formatCost(trace.costUsd)}${payload.cost.costComplete ? "" : " (partial/unavailable)"} |`,
    "",
    "## Execution timeline",
    "",
    "| # | Span | Type | Status | Attempt | Duration | Model |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...payload.spans.map(
      (span, index) =>
        `| ${index + 1} | ${mdCell(span.name)} | ${span.type} | ${span.status} | ${span.attemptNumber} | ${span.durationMs ?? "—"} ms | ${span.model ?? "—"} |`,
    ),
    "",
  ];

  if (errors.length > 0) {
    lines.push("## Errors", "");
    for (const span of errors) {
      const error = span.error as { type?: string; message?: string; stack?: string } | null;
      lines.push(
        `### ${mdCell(span.name)}`,
        "",
        `- **Type:** ${error?.type ?? "Error"}`,
        `- **Message:** ${error?.message ?? "Unknown error"}`,
        `- **Attempt:** ${span.attemptNumber}`,
        "",
      );
      if (error?.stack) {
        lines.push("```", truncate(error.stack, 2_000), "```", "");
      }
    }
  }

  lines.push("## Span details", "");
  for (const span of payload.spans) {
    lines.push(
      `### ${span.name}`,
      "",
      `- ID: \`${span.id}\``,
      `- Parent: ${span.parentSpanId ? `\`${span.parentSpanId}\`` : "root"}`,
      `- Type: ${span.type}`,
      `- Status: ${span.status}`,
      `- Started: ${span.startedAt}`,
      `- Duration: ${span.durationMs ?? "—"} ms`,
      "",
      "**Input**",
      "",
      jsonBlock(span.input),
      "",
      "**Output**",
      "",
      jsonBlock(span.output),
      "",
    );
  }

  lines.push(
    "---",
    "",
    `Exported ${payload.exportedAt} by AgentTrace. This report is sanitized and read-only.`,
    "",
  );

  return lines.join("\n");
}

export function renderHtml(payload: ExportPayload): string {
  const { trace } = payload;
  const errors = payload.spans.filter((span) => span.status === "error");
  const spanRows = payload.spans
    .map(
      (span) => `<tr>
        <td>${escapeHtml(span.name)}</td>
        <td><span class="type">${escapeHtml(span.type)}</span></td>
        <td><span class="status ${escapeHtml(span.status)}">${escapeHtml(span.status)}</span></td>
        <td>${span.durationMs ?? "—"} ms</td>
        <td>${escapeHtml(span.model ?? "—")}</td>
        <td>${span.attemptNumber}</td>
      </tr>`,
    )
    .join("");

  const spanDetails = payload.spans
    .map(
      (span) => `<section class="span">
        <h3>${escapeHtml(span.name)} <span class="status ${escapeHtml(span.status)}">${escapeHtml(span.status)}</span></h3>
        <p class="meta"><code>${escapeHtml(span.id)}</code> · ${escapeHtml(span.type)} · ${span.durationMs ?? "—"} ms${
          span.error ? ` · <strong class="error">${escapeHtml((span.error as { message?: string }).message ?? "Error")}</strong>` : ""
        }</p>
        <h4>Input</h4><pre>${escapeHtml(JSON.stringify(span.input, null, 2) ?? "null")}</pre>
        <h4>Output</h4><pre>${escapeHtml(JSON.stringify(span.output, null, 2) ?? "null")}</pre>
        ${span.error ? `<h4>Error</h4><pre>${escapeHtml(JSON.stringify(span.error, null, 2))}</pre>` : ""}
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AgentTrace — ${escapeHtml(trace.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #16181d; background: #fff; line-height: 1.55; }
  main { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 40px 0 12px; border-bottom: 1px solid #e6e8ec; padding-bottom: 8px; }
  h3 { font-size: 15px; margin: 24px 0 6px; }
  h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #636a76; margin: 14px 0 6px; }
  .sub { color: #636a76; font-size: 13px; margin: 0 0 24px; }
  .badge { display: inline-block; background: #eef2ff; color: #3949ab; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 600; letter-spacing: .02em; }
  .demo { background: #fff7e6; color: #8a5a00; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eceef2; vertical-align: top; }
  th { color: #636a76; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  code, pre { font-family: "SFMono-Regular", ui-monospace, Menlo, monospace; }
  pre { background: #f7f8fa; border: 1px solid #eceef2; border-radius: 8px; padding: 12px; font-size: 12px; overflow-x: auto; max-height: 420px; }
  .status { border-radius: 999px; font-size: 11px; padding: 2px 8px; font-weight: 600; background: #eef1f5; }
  .status.success { background: #e7f7ef; color: #066b45; }
  .status.error { background: #fdecef; color: #a11d33; }
  .status.running { background: #eef2ff; color: #3949ab; }
  .type { font-size: 11px; text-transform: uppercase; color: #636a76; letter-spacing: .04em; }
  .meta { color: #636a76; font-size: 12px; margin: 0; }
  .error { color: #a11d33; }
  .span { border-top: 1px solid #eceef2; padding-top: 8px; }
  .note { background: #f7f8fa; border-left: 3px solid #7c8cff; padding: 10px 14px; font-size: 12px; color: #4b5260; border-radius: 4px; }
  @media print { body { padding: 0; } pre { max-height: none; } .span { break-inside: avoid; } }
</style>
</head>
<body>
<main>
  <span class="badge ${trace.isDemo ? "demo" : ""}">${trace.isDemo ? "Sample data — synthetic demo trace" : "Recorded trace"}</span>
  <h1>${escapeHtml(trace.name)}</h1>
  <p class="sub">AgentTrace report · exported ${escapeHtml(payload.exportedAt)}</p>

  <h2>Summary</h2>
  <table>
    <tr><th>Trace ID</th><td><code>${escapeHtml(trace.id)}</code></td></tr>
    <tr><th>Agent</th><td>${escapeHtml(trace.agentName ?? "—")}</td></tr>
    <tr><th>Status</th><td>${escapeHtml(trace.status)}</td></tr>
    <tr><th>Started</th><td>${escapeHtml(trace.startedAt)}</td></tr>
    <tr><th>Duration</th><td>${trace.durationMs ?? "—"} ms</td></tr>
    <tr><th>Spans</th><td>${payload.spans.length}</td></tr>
    <tr><th>Tokens</th><td>${trace.totalInputTokens} input · ${trace.totalOutputTokens} output</td></tr>
    <tr><th>Estimated cost</th><td>${formatCost(trace.costUsd)}${payload.cost.costComplete ? "" : " (partial or unavailable)"}</td></tr>
  </table>
  <p class="note">${escapeHtml(payload.disclaimer)}</p>

  <h2>Execution timeline</h2>
  <table>
    <thead><tr><th>Span</th><th>Type</th><th>Status</th><th>Duration</th><th>Model</th><th>Attempt</th></tr></thead>
    <tbody>${spanRows}</tbody>
  </table>

  ${errors.length > 0 ? `<h2>Errors</h2>${errors.map((span) => `<div class="span"><h3>${escapeHtml(span.name)}</h3><p class="meta">${escapeHtml(((span.error as { message?: string })?.message) ?? "Unknown error")}</p></div>`).join("")}` : ""}

  <h2>Span details</h2>
  ${spanDetails}

  <p class="sub" style="margin-top:40px">Read-only report generated by AgentTrace. No external calls were made to produce it.</p>
</main>
</body>
</html>`;
}
