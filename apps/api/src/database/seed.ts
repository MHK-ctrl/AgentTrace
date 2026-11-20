import { SEED_PRICING, perMillionToPerToken } from "@agenttrace/shared";
import { count, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { pricingRules, traces } from "./schema.js";
import { ensureDemoKey } from "../services/api-keys.js";
import { buildDemoTrace, DEMO_SCENARIOS, type DemoScenario } from "../services/demo.js";
import { ingestBatch } from "../services/ingest.js";
import { ensureDemoProject } from "../services/projects.js";

export interface SeedOptions {
  demoProjectId: string;
  demoApiKey?: string;
  traceCount?: number;
  force?: boolean;
}

export interface SeedResult {
  projectId: string;
  projectName: string;
  tracesCreated: number;
  pricingRules: number;
  apiKeyStored: boolean;
}

export async function seedDemoDatabase(
  db: Database,
  options: SeedOptions,
): Promise<SeedResult> {
  const project = await ensureDemoProject(db, {
    id: options.demoProjectId,
    name: "Support Copilot (Demo)",
    description:
      "Synthetic demo project with realistic agent traces. Every trace here is simulated demo data.",
  });

  if (options.demoApiKey) {
    await ensureDemoKey(db, project.id, options.demoApiKey);
  }

  let pricingCount = 0;
  for (const rule of SEED_PRICING) {
    await db
      .insert(pricingRules)
      .values({
        projectId: project.id,
        model: rule.model,
        provider: rule.provider,
        inputPricePerToken: String(perMillionToPerToken(rule.inputPerMillion)),
        outputPricePerToken: String(perMillionToPerToken(rule.outputPerMillion)),
      })
      .onConflictDoUpdate({
        target: [pricingRules.projectId, pricingRules.model, pricingRules.provider],
        set: {
          inputPricePerToken: String(perMillionToPerToken(rule.inputPerMillion)),
          outputPricePerToken: String(perMillionToPerToken(rule.outputPerMillion)),
          updatedAt: new Date(),
        },
      });
    pricingCount += 1;
  }

  if (options.force) {
    await db.delete(traces).where(eq(traces.projectId, project.id));
  }

  const [existing] = await db
    .select({ value: count(traces.id) })
    .from(traces)
    .where(eq(traces.projectId, project.id));

  if (Number(existing?.value ?? 0) > 0) {
    return {
      projectId: project.id,
      projectName: project.name,
      tracesCreated: 0,
      pricingRules: pricingCount,
      apiKeyStored: Boolean(options.demoApiKey),
    };
  }

  const total = Math.min(Math.max(options.traceCount ?? 34, 7), 100);
  const now = Date.now();
  const spacingMs = (6.2 * 24 * 60 * 60 * 1000) / total;

  const scenarios: DemoScenario[] = [];
  for (let index = 0; index < total; index += 1) {
    // Keep the failure rate realistic and include every scenario at least once.
    scenarios.push(DEMO_SCENARIOS[index % DEMO_SCENARIOS.length] ?? "success");
  }
  // The newest trace is a retry-success showcase for the dashboard.
  scenarios[total - 1] = "retry_success";

  let created = 0;
  for (let index = 0; index < total; index += 1) {
    const scenario = scenarios[index] ?? "success";
    const ageMs = (total - index) * spacingMs + (index % 5) * 45_000;
    const start = new Date(Math.max(now - ageMs, now - 6.5 * 86_400_000));
    if (index === total - 1) start.setTime(now - 2 * 60_000);

    const { events } = buildDemoTrace(scenario, start);
    await ingestBatch({
      db,
      projectId: project.id,
      batch: {
        events,
        sdk: { name: "agenttrace-demo-seeder", version: "1.0.0" },
      },
    });
    created += 1;
  }

  return {
    projectId: project.id,
    projectName: project.name,
    tracesCreated: created,
    pricingRules: pricingCount,
    apiKeyStored: Boolean(options.demoApiKey),
  };
}
