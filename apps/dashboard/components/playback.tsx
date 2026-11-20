"use client";

import { Pause, Play, RotateCcw, ShieldCheck, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Select } from "@/components/ui";
import type { Span } from "@/lib/types";
import { cn, formatDuration, formatTimestamp, spanTone } from "@/lib/utils";

const SPEEDS = [0.5, 1, 2, 4] as const;

export function Playback({
  spans,
  selectedId,
  onSelect,
}: {
  spans: Span[];
  selectedId?: string | null;
  onSelect: (span: Span) => void;
}) {
  const ordered = useMemo(
    () =>
      [...spans].sort(
        (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      ),
    [spans],
  );

  const startMs = ordered.length
    ? Math.min(...ordered.map((span) => new Date(span.startedAt).getTime()))
    : 0;
  const endMs = ordered.length
    ? Math.max(
        ...ordered.map((span) => {
          const start = new Date(span.startedAt).getTime();
          return span.completedAt ? new Date(span.completedAt).getTime() : start + (span.durationMs ?? 0);
        }),
      )
    : 0;
  const totalMs = Math.max(endMs - startMs, 1);

  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    setElapsed(0);
    setPlaying(false);
  }, [spans]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setElapsed((current) => {
        const next = current + 60 * speed;
        if (next >= totalMs) {
          setPlaying(false);
          return totalMs;
        }
        return next;
      });
    }, 60);
    return () => clearInterval(timer);
  }, [playing, speed, totalMs]);

  const revealed = ordered.filter(
    (span) => new Date(span.startedAt).getTime() - startMs <= elapsed,
  );

  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-xs text-faint">
        No spans to replay.
      </div>
    );
  }

  const stepForward = () => {
    const next = ordered.find(
      (span) => new Date(span.startedAt).getTime() - startMs > elapsed + 1,
    );
    if (next) {
      setElapsed(new Date(next.startedAt).getTime() - startMs);
      onSelect(next);
    } else {
      setElapsed(totalMs);
      setPlaying(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-[11px] leading-relaxed text-muted">
          <span className="font-medium text-ink">Read-only playback.</span> This replays recorded
          timestamps and payloads from the trace. It does not re-execute tools, API calls or database
          writes, and cannot recreate the original runtime environment.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (elapsed >= totalMs) setElapsed(0);
              setPlaying((current) => !current);
            }}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? "Pause" : elapsed >= totalMs ? "Replay" : "Play"}
          </Button>
          <Button variant="secondary" size="sm" onClick={stepForward} title="Step to next span">
            <SkipForward className="h-3.5 w-3.5" /> Step
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setElapsed(0);
              setPlaying(false);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.08em] text-faint">Speed</span>
            <Select
              value={String(speed)}
              onChange={(event) => setSpeed(Number(event.target.value) as typeof speed)}
              className="h-7 w-[74px] text-xs"
              aria-label="Playback speed"
            >
              {SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </Select>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={totalMs}
          value={elapsed}
          onChange={(event) => {
            setPlaying(false);
            setElapsed(Number(event.target.value));
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-panel-3 accent-[var(--accent)]"
          aria-label="Playback position"
        />

        <div className="mono mt-2 flex items-center justify-between text-[10px] tabular-nums text-faint">
          <span>{formatDuration(elapsed)} elapsed</span>
          <span>
            {revealed.length}/{ordered.length} ops revealed
          </span>
          <span>{formatDuration(totalMs)} total</span>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {revealed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-xs text-faint">
            Press play to replay the recorded execution sequence.
          </p>
        ) : (
          [...revealed].reverse().map((span, index) => (
            <button
              key={span.id}
              onClick={() => onSelect(span)}
              className={cn(
                "fade-in flex w-full items-center gap-2.5 rounded-lg border border-line bg-panel px-3 py-2 text-left transition hover:border-line-strong",
                selectedId === span.id && "border-accent/50 bg-accent-soft/40",
                index === 0 && playing && "rise-in",
              )}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: span.status === "error" ? "var(--danger)" : spanTone(span.operationType),
                }}
              />
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{span.operationName}</span>
              <span className="mono shrink-0 text-[10px] text-faint">{span.operationType}</span>
              <span className="mono shrink-0 text-[10px] tabular-nums text-muted">
                +{formatDuration(new Date(span.startedAt).getTime() - startMs)}
              </span>
              <span className="mono hidden shrink-0 text-[10px] tabular-nums text-faint sm:block">
                {formatDuration(span.durationMs)}
              </span>
              <span className="mono hidden shrink-0 text-[10px] text-faint md:block" title={formatTimestamp(span.startedAt)}>
                {new Date(span.startedAt).toLocaleTimeString()}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
