"use client";

import Link from "next/link";
import { ArrowRight, FolderPlus, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/components/providers";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/api";
import type { Project } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";

export default function ProjectsPage() {
  const { projects, projectsLoading, projectId, setProjectId, reloadProjects, toast } =
    useWorkspace();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>("/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
      });
      await reloadProjects();
      setProjectId(result.project.id);
      setCreateOpen(false);
      setName("");
      setDescription("");
      toast(`Project "${result.project.name}" created`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to create the project");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (project: Project) => {
    setEditing(project);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setError(null);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    setEditSaving(true);
    try {
      await apiFetch(`/v1/projects/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      await reloadProjects();
      setEditing(null);
      toast("Project updated");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to update the project");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <FolderPlus className="h-3 w-3" /> Workspace
          </>
        }
        title="Projects"
        description="Projects isolate ingestion keys, traces, pricing and realtime streams. The dashboard can switch between them at any time."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New project
          </Button>
        }
      />

      {projectsLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[180px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const active = project.id === projectId;
            return (
              <div
                key={project.id}
                className={`panel flex flex-col p-4 transition ${
                  active ? "border-accent/40 shadow-[inset_0_0_0_1px_var(--accent-soft)]" : "panel-hover"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-ink">{project.name}</h3>
                      {project.isDemo ? <Badge tone="warning">Sample</Badge> : null}
                      {active ? <Badge tone="accent" dot>active</Badge> : null}
                    </div>
                    <p className="mono mt-1 text-[10px] text-faint">{project.slug}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(project)} aria-label="Edit project">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <p className="mt-2 line-clamp-2 min-h-[32px] text-[11px] leading-relaxed text-muted">
                  {project.description ?? "No description."}
                </p>

                <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-[10px] text-faint">
                  <span>
                    <span className="mono text-ink">{formatNumber(project.traceCount)}</span> traces
                  </span>
                  <span>last {project.lastTraceAt ? formatDate(project.lastTraceAt) : "—"}</span>
                  <span className="ml-auto">{formatDate(project.createdAt)}</span>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  {active ? (
                    <Link href="/traces" className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        Open traces <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setProjectId(project.id);
                        toast(`Switched to ${project.name}`, "info");
                      }}
                    >
                      Switch project
                    </Button>
                  )}
                  <Link href="/api-keys">
                    <Button variant="ghost" size="sm">
                      Keys
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-line bg-panel p-4">
        <h3 className="text-xs font-semibold text-ink">Isolation model</h3>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted">
          API keys are scoped to one project. Ingestion writes are constrained to the key's project,
          and WebSocket subscriptions are bound to a single project, so telemetry is never broadcast
          across projects. The dashboard itself is a local admin surface protected by a server-side
          token.
        </p>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create project"
        description="A project groups traces, API keys, pricing rules and live streams."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void create()} loading={saving}>
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="project-name">
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Support Copilot"
              maxLength={120}
            />
          </Field>
          <Field label="Description" hint="Optional, helps teammates identify the project">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this agent do?"
              maxLength={1_000}
            />
          </Field>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit project"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} loading={editSaving}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Description">
            <Textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              maxLength={1_000}
            />
          </Field>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
