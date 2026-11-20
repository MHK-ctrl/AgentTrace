"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopySnippet({ code, label = "Copy" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="focus-ring flex h-7 items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 text-[10px] font-medium text-muted transition hover:text-ink"
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}
