"use client";

import { DollarSign, Moon, Pencil, Plus, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  SectionCard,
  Select,
  Skeleton,
} from "@/components/ui";
import { useApi } from "@/hooks/use-api";
import { ApiError, apiFetch } from "@/lib/api";
import type { PricingRule } from "@/lib/types";

interface PricingForm {
  model: string;
  provider: string;
  inputPrice: string;
  outputPrice: string;
  currency: string;
}

const EMPTY_FORM: PricingForm = {
  model: "",
  provider: "any",
  inputPrice: "",
  outputPrice: "",
  currency: "USD",
};

export default function SettingsPage() {
  const { projectId, project, theme, toggleTheme, toast } = useWorkspace();
  const pricing = useApi<{ pricing: PricingRule[] }>(
    projectId ? `/v1/pricing?projectId=${projectId}` : null,
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PricingRule | null>(null);
  const [form, setForm] = useState<PricingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setOpen(true);
  };

  const startEdit = (rule: PricingRule) => {
    setEditing(rule);
    setForm({
      model: rule.model,
      provider: rule.provider,
      inputPrice: String(rule.inputPricePerMillion),
      outputPrice: String(rule.outputPricePerMillion),
      currency: rule.currency,
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!projectId) return;
    const input = Number(form.inputPrice);
    const output = Number(form.outputPrice);
    if (!form.model.trim()) {
      setError("Model name is required");
      return;
    }
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
      setError("Prices must be non-negative numbers");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiFetch(`/v1/pricing/${editing.id}?projectId=${projectId}`, {
          method: "PATCH",
          body: JSON.stringify({
            inputPricePerMillion: input,
            outputPricePerMillion: output,
            currency: form.currency,
          }),
        });
        toast("Pricing rule updated");
      } else {
        await apiFetch("/v1/pricing", {
          method: "POST",
          body: JSON.stringify({
            projectId,
            model: form.model.trim(),
            provider: form.provider.trim() || "any",
            inputPricePerMillion: input,
            outputPricePerMillion: output,
            currency: form.currency,
          }),
        });
        toast("Pricing rule added");
      }
      setOpen(false);
      await pricing.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to save the pricing rule");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (rule: PricingRule) => {
    if (!projectId) return;
    if (deleting !== rule.id) {
      setDeleting(rule.id);
      return;
    }
    try {
      await apiFetch(`/v1/pricing/${rule.id}?projectId=${projectId}`, { method: "DELETE" });
      setDeleting(null);
      await pricing.reload();
      toast("Pricing rule deleted", "info");
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : "Unable to delete the rule", "error");
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <ShieldCheck className="h-3 w-3" /> Configuration
          </>
        }
        title="Settings"
        description={`Pricing, privacy defaults and appearance for ${project?.name ?? "this project"}.`}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SectionCard
            title="Model pricing"
            description="Used to estimate cost from provider-reported token usage. Rates are user-managed and may differ from provider invoices."
            action={
              <Button size="sm" variant="secondary" onClick={startCreate}>
                <Plus className="h-3.5 w-3.5" /> Add model
              </Button>
            }
          >
            {pricing.error ? (
              <ErrorState message={pricing.error.message} onRetry={() => void pricing.reload()} />
            ) : pricing.loading && !pricing.data ? (
              <div className="space-y-2">
                <Skeleton className="h-9" />
                <Skeleton className="h-9" />
              </div>
            ) : !pricing.data || pricing.data.pricing.length === 0 ? (
              <EmptyState
                icon={<DollarSign className="h-4 w-4" />}
                title="No pricing configured"
                description="Without pricing, AgentTrace shows cost as unavailable instead of inventing a number."
                action={
                  <Button size="sm" onClick={startCreate}>
                    Add your first model
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-faint">
                      <th className="pb-2 pr-3 font-medium">Model / provider</th>
                      <th className="px-3 pb-2 text-right font-medium">Input / 1M</th>
                      <th className="px-3 pb-2 text-right font-medium">Output / 1M</th>
                      <th className="px-3 pb-2 text-right font-medium">Currency</th>
                      <th className="pb-2 pl-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.data.pricing.map((rule) => (
                      <tr key={rule.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2.5 pr-3">
                          <span className="mono block text-[11px] text-ink">{rule.model}</span>
                          <span className="text-[10px] text-faint">{rule.provider}</span>
                        </td>
                        <td className="mono px-3 py-2.5 text-right text-muted">
                          ${rule.inputPricePerMillion.toFixed(4)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right text-muted">
                          ${rule.outputPricePerMillion.toFixed(4)}
                        </td>
                        <td className="mono px-3 py-2.5 text-right text-muted">{rule.currency}</td>
                        <td className="py-2.5 pl-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => startEdit(rule)} aria-label="Edit pricing">
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant={deleting === rule.id ? "danger" : "ghost"}
                              size="icon"
                              onClick={() => void remove(rule)}
                              onMouseLeave={() => setDeleting((current) => (current === rule.id ? null : current))}
                              aria-label="Delete pricing"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-line bg-panel-2 px-3 py-2.5">
              <p className="text-[10px] leading-relaxed text-faint">
                <span className="font-medium text-muted">Estimate formula:</span>{" "}
                <span className="mono">
                  cost = input tokens × input price per token + output tokens × output price per token
                </span>
                . Prices are stored per token; the form accepts USD per million tokens.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Privacy defaults" description="How AgentTrace handles potentially sensitive telemetry">
            <div className="space-y-3 text-[11px] leading-relaxed text-muted">
              <div className="rounded-lg border border-line bg-panel-2 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="success">secure default</Badge>
                  <span className="font-medium text-ink">Input/output capture is off</span>
                </div>
                Payloads are only recorded when the SDK is constructed with{" "}
                <code className="mono text-muted">captureInputOutput: true</code> (or per-span).
              </div>
              <div className="rounded-lg border border-line bg-panel-2 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="info">redaction</Badge>
                  <span className="font-medium text-ink">Secrets are filtered before transmission</span>
                </div>
                Authorization headers, API keys, passwords, cookies and tokens are redacted in the
                SDK and again at the API boundary. Payload size is capped.
              </div>
              <div className="rounded-lg border border-line bg-panel-2 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="neutral">local-first</Badge>
                  <span className="font-medium text-ink">Your data stays in your database</span>
                </div>
                No external analytics, tracking, or third-party telemetry services are used.
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Appearance" description="Theme is stored locally in this browser">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted">
                {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                {theme === "dark" ? "Dark interface" : "Light interface"}
              </div>
              <Button variant="secondary" size="sm" onClick={toggleTheme}>
                Switch to {theme === "dark" ? "light" : "dark"}
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="About" description="AgentTrace developer preview">
            <dl className="space-y-2.5 text-[11px]">
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Version</dt>
                <dd className="mono text-ink">0.1.0</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Project</dt>
                <dd className="mono truncate text-ink">{project?.slug ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">License</dt>
                <dd className="text-ink">MIT</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-faint">Data mode</dt>
                <dd className="text-ink">{project?.isDemo ? "Synthetic demo" : "Live"}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[10px] leading-relaxed text-faint">
              AgentTrace is an open-source project and has not undergone a formal security audit.
              Review the security model before deploying it for sensitive production telemetry.
            </p>
          </SectionCard>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit pricing rule" : "Add pricing rule"}
        description="Enter USD per one million tokens. Conversion to per-token pricing is automatic."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? "Save changes" : "Add rule"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Model" hint="Must match the model recorded by your instrumentation">
            <Input
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
              placeholder="gpt-4o"
              disabled={Boolean(editing)}
            />
          </Field>
          <Field label="Provider" hint='Use "any" to match any provider'>
            <Input
              value={form.provider}
              onChange={(event) => setForm({ ...form, provider: event.target.value })}
              placeholder="openai"
              disabled={Boolean(editing)}
            />
          </Field>
          <Field label="Input price / 1M tokens">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.inputPrice}
              onChange={(event) => setForm({ ...form, inputPrice: event.target.value })}
              placeholder="2.50"
            />
          </Field>
          <Field label="Output price / 1M tokens">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.outputPrice}
              onChange={(event) => setForm({ ...form, outputPrice: event.target.value })}
              placeholder="10.00"
            />
          </Field>
          <Field label="Currency">
            <Select
              value={form.currency}
              onChange={(event) => setForm({ ...form, currency: event.target.value })}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          </Field>
        </div>
        {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      </Modal>
    </div>
  );
}
