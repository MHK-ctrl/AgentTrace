import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCost(
  value: number | null | undefined,
  complete = true,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs < 0.01 ? 6 : abs < 1 ? 4 : 2;
  return `${complete ? "" : "~"}$${value.toFixed(digits)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [size, unit] of units) {
    if (abs >= size) return formatter.format((future ? 1 : -1) * Math.round(abs / size), unit);
  }
  return "just now";
}

export function formatTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString();
}

export function truncate(value: string, length = 60): string {
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

export function percentDelta(current: number | null, baseline: number | null): number | null {
  if (current === null || baseline === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return (current - baseline) / baseline;
}

export function statusTone(status: string): "success" | "danger" | "warning" | "neutral" | "info" {
  switch (status) {
    case "success":
      return "success";
    case "error":
      return "danger";
    case "cancelled":
      return "warning";
    case "running":
      return "info";
    default:
      return "neutral";
  }
}

export const SPAN_TYPE_TONES: Record<string, string> = {
  agent: "var(--accent)",
  llm: "var(--violet)",
  tool: "var(--cyan)",
  api: "#60a5fa",
  database: "#f5b747",
  retrieval: "#34d399",
  custom: "var(--muted)",
};

export function spanTone(type: string): string {
  return SPAN_TYPE_TONES[type] ?? "var(--muted)";
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}
