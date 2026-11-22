"use client";

import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Skeleton,
} from "@/components/ui";
import { useApi } from "@/hooks/use-api";
import { ApiError, apiFetch } from "@/lib/api";
import type { ApiKeySummary } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ApiKeysPage() {
  const { projectId, project, toast } = useWorkspace();
  const keys = useApi<{ apiKeys: ApiKeySummary[] }>(
    projectId ? `/v1/api-keys?projectId=${projectId}` : null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const endpoint =
    process.env.NEXT_PUBLIC_AGENTTRACE_API_URL?.replace(/\/+$/, "") ?? "http://localhost:4000";

  const create = async () => {
    if (!projectId || !name.trim()) {
      setError("Key name is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await apiFetch<{ key: string; apiKey: ApiKeySummary }>("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ projectId, name: name.trim() }),
      });
      setCreated({ key: result.key, name: result.apiKey.name });
      setName("");
      setCreateOpen(false);
      await keys.reload();
      toast("API key created — copy it now");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create the API key");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    if (!projectId) return;
    if (revoking !== id) {
      setRevoking(id);
      return;
    }
    try {
      await apiFetch(`/v1/api-keys/${id}/revoke?projectId=${projectId}`, { method: "POST" });
      setRevoking(null);
      await keys.reload();
      toast("API key revoked", "info");
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : "Unable to revoke the key", "error");
    }
  };

  const snippet = `import { AgentTrace } from "agenttrace-sdk";

const agenttrace = new AgentTrace({
  apiKey: process.env.AGENTTRACE_API_KEY!,
  endpoint: process.env.AGENTTRACE_ENDPOINT ?? "${endpoint}",
  captureInputOutput: false
});

await agenttrace.trace(
  { name: "support-agent", agentName: "support-copilot" },
  async (trace) => {
    await trace.llm(
      {
        name: "plan-resolution",
        model: "your-model",
        provider: "your-provider",
        tokenUsage: { input: 812, output: 164 }
      },
      async () => ({ intent: "billing_refund" })
    );
  }
);

await agenttrace.shutdown();`;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <KeyRound className="h-3 w-3" /> Access
          </>
        }
        title="API keys"
        description={`Ingestion keys for ${project?.name ?? "this project"}. Keys are hashed before storage and can be revoked at any time.`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!projectId}>
            <Plus className="h-3.5 w-3.5" /> Create key
          </Button>
        }
      />

      {keys.error ? (
        <ErrorState message={keys.error.message} onRetry={() => void keys.reload()} />
      ) : keys.loading && !keys.data ? (
        <Skeleton className="h-[240px] w-full" />
      ) : !keys.data || keys.data.apiKeys.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-4 w-4" />}
          title="No API keys yet"
          description="Create a key to start sending traces from your application. The full key is displayed only once."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create your first key
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-faint">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Key prefix</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Last used</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.data.apiKeys.map((key) => {
                  const revoked = Boolean(key.revokedAt);
                  return (
                    <tr key={key.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{key.name}</td>
                      <td className="mono px-4 py-3 text-[11px] text-muted">{key.keyPrefix}…</td>
                      <td className="px-4 py-3 text-[11px] text-muted">{formatDate(key.createdAt)}</td>
                      <td className="px-4 py-3 text-[11px] text-muted">
                        {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={revoked ? "neutral" : "success"} dot>
                          {revoked ? "revoked" : "active"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!revoked ? (
                          <Button
                            variant={revoking === key.id ? "danger" : "ghost"}
                            size="sm"
                            onClick={() => void revoke(key.id)}
                            onMouseLeave={() => setRevoking((current) => (current === key.id ? null : current))}
                          >
                            <Trash2 className="h-3 w-3" />
                            {revoking === key.id ? "Confirm revoke" : "Revoke"}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-faint">No access</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Connect your agent"
          description="Install the SDK in your Node.js application"
          action={<CopyButton value={snippet} label="Copy code" size="sm" />}
        >
          <pre className="scroll-thin overflow-x-auto rounded-lg border border-line bg-[var(--panel-2)] p-3 font-mono text-[10.5px] leading-[1.7] text-muted">
            <code>{snippet}</code>
          </pre>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Find the key for this project in <span className="mono">.env</span> as{" "}
            <span className="mono">AGENTTRACE_DEMO_API_KEY</span> when running the bundled demo, or create
            a new key above.
          </p>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Environment" description="Copy these variables into your app">
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <code className="mono min-w-0 flex-1 truncate text-[10px] text-muted">
                  AGENTTRACE_ENDPOINT={endpoint}
                </code>
                <CopyButton value={`AGENTTRACE_ENDPOINT=${endpoint}`} />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                <code className="mono min-w-0 flex-1 truncate text-[10px] text-muted">
                  AGENTTRACE_API_KEY=at_live_…
                </code>
                <CopyButton value="AGENTTRACE_API_KEY=" label="Copy name" size="sm" />
              </div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              Never commit real keys. The server stores only a SHA-256 hash, and revoked keys are
              rejected immediately.
            </p>
          </SectionCard>

          <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent-soft px-3.5 py-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p className="text-[11px] leading-relaxed text-muted">
              Input/output capture is off by default. When enabled, the SDK redacts secrets and limits
              payload size before transmitting anything.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create API key"
        description="Name the key after the service or environment that will use it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={creating}>
              Create key
            </Button>
          </>
        }
      >
        <Field label="Key name" hint="For example: production-support-agent">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="production"
            maxLength={100}
            autoFocus
          />
        </Field>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
      </Modal>

      <Modal
        open={created !== null}
        onClose={() => setCreated(null)}
        title="Copy your API key"
        description="This is the only time the full key will be displayed."
        footer={
          <Button onClick={() => setCreated(null)}>I have copied it</Button>
        }
      >
        {created ? (
          <div>
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5">
              <code className="mono min-w-0 flex-1 break-all text-[11px] text-ink">{created.key}</code>
              <CopyButton value={created.key} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Store it as <span className="mono">AGENTTRACE_API_KEY</span> in your application
              environment. AgentTrace stores only a hash and cannot recover this key.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
