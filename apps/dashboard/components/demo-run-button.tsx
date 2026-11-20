"use client";

import { AlertTriangle, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDemoWorkspace } from "@/components/demo-provider";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function DemoRunButton({
  variant = "primary",
  size = "sm",
  className,
  label = "Run sample agent",
}: {
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const { session } = useDemoWorkspace();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });

      if (response.status === 401) {
        window.location.assign("/api/demo/start?next=/demo");
        return;
      }

      const body = (await response.json()) as {
        traceId?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.traceId) {
        setError(body.error?.message ?? "The sample agent could not complete.");
        return;
      }

      router.push(`/demo/traces/${body.traceId}`);
      router.refresh();
    } catch {
      setError("The sample agent is temporarily unavailable.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Button
        size={size}
        variant={variant}
        loading={running}
        disabled={running || session.runsRemaining === 0}
        onClick={() => void run()}
        title={
          session.runsRemaining === 0
            ? "This demo session has used all sample runs"
            : `Run the real SDK demo agent (${session.runsRemaining} runs left)`
        }
      >
        {!running ? <Play className="h-3.5 w-3.5" /> : null}
        {running ? "Running SDK trace…" : label}
      </Button>
      {error ? (
        <div
          role="alert"
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[300px] items-start gap-2 rounded-lg border border-danger/30 bg-panel px-3 py-2.5 text-[11px] leading-relaxed text-danger shadow-xl"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
