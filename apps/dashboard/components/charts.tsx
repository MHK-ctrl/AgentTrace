"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelUsage, OverviewResponse } from "@/lib/types";
import { formatCompact, formatDuration, formatNumber, formatShortDate } from "@/lib/utils";

const AXIS = {
  stroke: "var(--line)",
  tick: { fill: "var(--muted)", fontSize: 10, fontFamily: "var(--font-mono)" },
  tickLine: false,
  axisLine: false,
} as const;

const GRID = { stroke: "var(--line)", strokeDasharray: "3 3", vertical: false } as const;

function bucketTick(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (value.endsWith("T00:00:00Z")) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
}

const tooltipStyle = {
  background: "var(--panel-2)",
  border: "1px solid var(--line-strong)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--ink)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
  padding: "8px 10px",
} as const;

interface TipPayload {
  name?: string;
  value?: number | string;
  color?: string;
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  let displayLabel: string = String(label ?? "");
  if (typeof label === "string" && /\d{4}-\d{2}-\d{2}T/.test(label)) {
    displayLabel = formatShortDate(label);
  }
  return (
    <div style={tooltipStyle}>
      <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-faint">{displayLabel}</p>
      {payload.map((entry, index) => (
        <div key={`${entry.name}-${index}`} className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: entry.color ?? "var(--accent)" }}
          />
          <span className="text-muted">{entry.name}</span>
          <span className="mono ml-auto pl-3 tabular-nums text-ink">
            {typeof entry.value === "number" ? formatNumber(entry.value) : String(entry.value ?? "—")}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartEmpty({ message = "No data in this range" }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-dashed border-line-strong">
      <p className="text-xs text-faint">{message}</p>
    </div>
  );
}

export function VolumeChart({ data }: { data: OverviewResponse["timeseries"] }) {
  const hasData = data.some((point) => point.total > 0);
  if (!hasData) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="successFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="failedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="bucket" {...AXIS} tickFormatter={bucketTick} minTickGap={36} />
        <YAxis {...AXIS} allowDecimals={false} width={36} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--line-strong)" }} />
        <Area
          type="monotone"
          dataKey="success"
          name="Successful"
          stackId="1"
          stroke="var(--success)"
          strokeWidth={1.5}
          fill="url(#successFill)"
        />
        <Area
          type="monotone"
          dataKey="failed"
          name="Failed"
          stackId="1"
          stroke="var(--danger)"
          strokeWidth={1.5}
          fill="url(#failedFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ data }: { data: OverviewResponse["timeseries"] }) {
  const hasData = data.some((point) => point.avgDurationMs !== null);
  if (!hasData) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: -8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="bucket" {...AXIS} tickFormatter={bucketTick} minTickGap={36} />
        <YAxis {...AXIS} width={46} tickFormatter={(value: number) => formatDuration(value)} />
        <Tooltip content={<ChartTip />} cursor={{ stroke: "var(--line-strong)" }} />
        <Line
          type="monotone"
          dataKey="avgDurationMs"
          name="Avg latency"
          stroke="var(--accent)"
          strokeWidth={1.75}
          dot={false}
          activeDot={{ r: 3, fill: "var(--accent)" }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function TokensChart({ data }: { data: OverviewResponse["timeseries"] }) {
  const hasData = data.some((point) => point.tokens > 0);
  if (!hasData) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 14, bottom: 0, left: -8 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="bucket" {...AXIS} tickFormatter={bucketTick} minTickGap={36} />
        <YAxis {...AXIS} width={40} tickFormatter={(value: number) => formatCompact(value)} />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--accent-soft)" }} />
        <Bar dataKey="tokens" name="Tokens" fill="var(--violet)" radius={[3, 3, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OutcomesDonut({ totals }: { totals: OverviewResponse["totals"] }) {
  const data = [
    { name: "Success", value: totals.success, color: "var(--success)" },
    { name: "Failed", value: totals.failed, color: "var(--danger)" },
    { name: "Running", value: totals.running, color: "var(--accent)" },
    { name: "Cancelled", value: totals.cancelled, color: "var(--warning)" },
  ].filter((entry) => entry.value > 0);

  if (data.length === 0) return <ChartEmpty />;

  return (
    <div className="flex h-[220px] items-center gap-3">
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            stroke="var(--panel)"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<ChartTip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-sm" style={{ background: entry.color }} />
            <span className="text-muted">{entry.name}</span>
            <span className="mono ml-auto tabular-nums text-ink">{formatNumber(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModelsChart({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) return <ChartEmpty />;
  const data = models.slice(0, 6).map((model) => ({
    name: model.model,
    calls: model.calls,
    tokens: model.inputTokens + model.outputTokens,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(170, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }}>
        <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          {...AXIS}
          width={110}
          tick={{ fill: "var(--muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
        />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--accent-soft)" }} />
        <Bar dataKey="calls" name="Calls" fill="var(--accent)" radius={[0, 3, 3, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DurationsChart({ durations }: { durations: OverviewResponse["durations"] }) {
  const hasData = durations.some((bucket) => bucket.count > 0);
  if (!hasData) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={durations} margin={{ top: 6, right: 8, bottom: 8, left: -16 }}>
        <CartesianGrid {...GRID} />
        <XAxis
          dataKey="label"
          {...AXIS}
          interval={0}
          angle={-18}
          textAnchor="end"
          height={44}
          tick={{ fill: "var(--muted)", fontSize: 9, fontFamily: "var(--font-mono)" }}
        />
        <YAxis {...AXIS} allowDecimals={false} width={34} />
        <Tooltip content={<ChartTip />} cursor={{ fill: "var(--accent-soft)" }} />
        <Bar dataKey="count" name="Traces" fill="var(--cyan)" radius={[3, 3, 0, 0]} maxBarSize={30} />
      </BarChart>
    </ResponsiveContainer>
  );
}
