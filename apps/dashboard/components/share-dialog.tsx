"use client";

import { ExternalLink, Link2, ShieldAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Button, CopyButton, Field, Input, Modal, Select, Skeleton } from "@/components/ui";
import type { ShareSummary, TraceSummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function ShareDialog({
  open,
  onClose,
  trace,
  projectId,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  trace: TraceSummary;
  projectId: string;
  onToast?: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("7");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensitive = trace.metadata?.sensitive === true;

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ shares: ShareSummary[] }>(
        `/v1/traces/${trace.id}/shares?projectId=${projectId}`,
      );
      setShares(data.shares);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load share links");
    } finally {
      setLoading(false);
    }
  }, [trace.id, projectId]);

  useEffect(() => {
    if (!open) return;
    setCreatedUrl(null);
    setError(null);
    setLabel("");
    void loadShares();
  }, [open, loadShares]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await apiFetch<{ url: string }>(`/v1/traces/${trace.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          label: label.trim() || undefined,
          expiresInDays: expiry === "never" ? null : Number(expiry),
        }),
      });
      setCreatedUrl(data.url);
      setLabel("");
      onToast?.("Read-only share link created");
      await loadShares();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create a share link");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (shareId: string) => {
    if (revoking !== shareId) {
      setRevoking(shareId);
      return;
    }
    try {
      await apiFetch(`/v1/shares/${shareId}?projectId=${projectId}`, { method: "DELETE" });
      setRevoking(null);
      await loadShares();
      onToast?.("Share link revoked", "info");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to revoke the link");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share trace snapshot"
      description="Create a read-only, sanitized snapshot. No execution is re-run and no credentials are exposed."
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => void create()} loading={creating} disabled={sensitive}>
            <Link2 className="h-3.5 w-3.5" /> Create link
          </Button>
        </>
      }
    >
      {sensitive ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-muted">
            This trace is marked sensitive via its metadata. Sharing is disabled. Remove the{" "}
            <code className="mono">sensitive: true</code> metadata flag first if this data is safe to
            publish.
          </p>
        </div>
      ) : null}

      {createdUrl ? (
        <div className="mb-4 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5">
          <p className="text-[11px] font-medium text-success">
            Link created — copy it now, it is shown only once
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded border border-line bg-panel px-2 py-1.5 text-[10px] text-ink">
              {createdUrl}
            </code>
            <CopyButton value={createdUrl} label="Copy" size="sm" />
            <a
              href={createdUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs text-muted hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label" hint="Optional, shown in the share list">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. support review"
            maxLength={200}
          />
        </Field>
        <Field label="Expires" hint="Sharing is always read-only">
          <Select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            <option value="1">After 1 day</option>
            <option value="7">After 7 days</option>
            <option value="30">After 30 days</option>
            <option value="never">No expiry</option>
          </Select>
        </Field>
      </div>

      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}

      <div className="mt-5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
          Existing links
        </p>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : shares.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-4 text-center text-[11px] text-faint">
            No share links yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {shares.map((share) => (
              <div
                key={share.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2"
              >
                <span className="mono text-[10px] text-muted">{share.tokenPrefix}…</span>
                <span className="text-[11px] text-ink">{share.label || "Untitled link"}</span>
                <span
                  className={
                    share.status === "active"
                      ? "text-[10px] text-success"
                      : share.status === "expired"
                        ? "text-[10px] text-warning"
                        : "text-[10px] text-faint"
                  }
                >
                  {share.status}
                </span>
                <span className="mono ml-auto text-[9px] text-faint">
                  {share.expiresAt ? `expires ${formatDate(share.expiresAt)}` : "no expiry"}
                </span>
                {share.status !== "revoked" ? (
                  <Button
                    variant={revoking === share.id ? "danger" : "ghost"}
                    size="sm"
                    onClick={() => void revoke(share.id)}
                    onMouseLeave={() => setRevoking((current) => (current === share.id ? null : current))}
                  >
                    <Trash2 className="h-3 w-3" />
                    {revoking === share.id ? "Confirm" : "Revoke"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
