import { and, count, eq, max, sql } from "drizzle-orm";
import type { Database } from "../database/client.js";
import { projects, traces } from "../database/schema.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";

export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDemo: boolean;
  createdAt: Date;
  traceCount: number;
  lastTraceAt: Date | null;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function listProjects(db: Database): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      isDemo: projects.isDemo,
      createdAt: projects.createdAt,
      traceCount: count(traces.id),
      lastTraceAt: max(traces.startedAt),
    })
    .from(projects)
    .leftJoin(traces, eq(traces.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(projects.createdAt);

  return rows.map((row) => ({
    ...row,
    traceCount: Number(row.traceCount),
  }));
}

export async function createProject(
  db: Database,
  input: { name: string; description?: string },
): Promise<ProjectSummary> {
  const name = input.name.trim();
  if (!name) throw badRequest("Project name is required");
  const base = slugify(name) || "project";

  const existing = await db.select({ slug: projects.slug }).from(projects);
  const taken = new Set(existing.map((row) => row.slug));
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  const [row] = await db
    .insert(projects)
    .values({
      name,
      slug,
      description: input.description?.trim() || null,
    })
    .returning();

  if (!row) throw new Error("Failed to create project");
  return {
    ...row,
    traceCount: 0,
    lastTraceAt: null,
  };
}

export async function updateProject(
  db: Database,
  projectId: string,
  input: { name?: string; description?: string | null },
): Promise<ProjectSummary> {
  const [updated] = await db
    .update(projects)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  if (!updated) throw notFound("Project not found");

  const [stats] = await db
    .select({ traceCount: count(traces.id), lastTraceAt: max(traces.startedAt) })
    .from(traces)
    .where(eq(traces.projectId, projectId));

  return {
    ...updated,
    traceCount: Number(stats?.traceCount ?? 0),
    lastTraceAt: stats?.lastTraceAt ?? null,
  };
}

export async function getProject(db: Database, projectId: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!row) throw notFound("Project not found");
  return row;
}

/** Ensures the fixed demo project exists. Used by seeding and setup. */
export async function ensureDemoProject(
  db: Database,
  input: { id: string; name?: string; description?: string },
): Promise<typeof projects.$inferSelect> {
  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, input.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(projects)
    .values({
      id: input.id,
      name: input.name ?? "Support Copilot (Demo)",
      slug: "support-copilot-demo",
      description:
        input.description ??
        "Synthetic demo project with realistic agent traces. All data is simulated.",
      isDemo: true,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [row] = await db.select().from(projects).where(eq(projects.id, input.id)).limit(1);
  if (!row) throw conflict("Unable to create the demo project");
  return row;
}

export async function getDemoProject(db: Database, fallbackId: string) {
  const [demo] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.isDemo, true)))
    .orderBy(projects.createdAt)
    .limit(1);
  if (demo) return demo;
  return ensureDemoProject(db, { id: fallbackId });
}

export async function projectTraceCount(db: Database, projectId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(traces)
    .where(eq(traces.projectId, projectId));
  return Number(row?.value ?? 0);
}
