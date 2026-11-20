import { perMillionToPerToken, type TokenPricing } from "@agenttrace/shared";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../database/client.js";
import { pricingRules, type PricingRuleRow } from "../database/schema.js";
import { ApiError, notFound } from "../utils/errors.js";

export const pricingInputSchema = z.object({
  projectId: z.string().uuid(),
  model: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(200).default("any"),
  /** USD per million tokens, converted to per-token decimals before storage. */
  inputPricePerMillion: z.number().nonnegative().max(1_000_000),
  outputPricePerMillion: z.number().nonnegative().max(1_000_000),
  currency: z.string().length(3).default("USD"),
});

export const pricingUpdateSchema = pricingInputSchema
  .omit({ projectId: true, model: true, provider: true })
  .partial();

export type PricingInput = z.infer<typeof pricingInputSchema>;

export async function listPricing(db: Database, projectId: string): Promise<PricingRuleRow[]> {
  return db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.projectId, projectId))
    .orderBy(asc(pricingRules.model), asc(pricingRules.provider));
}

export async function createPricing(db: Database, input: PricingInput): Promise<PricingRuleRow> {
  const [row] = await db
    .insert(pricingRules)
    .values({
      projectId: input.projectId,
      model: input.model,
      provider: input.provider || "any",
      inputPricePerToken: String(perMillionToPerToken(input.inputPricePerMillion)),
      outputPricePerToken: String(perMillionToPerToken(input.outputPricePerMillion)),
      currency: input.currency,
    })
    .onConflictDoUpdate({
      target: [pricingRules.projectId, pricingRules.model, pricingRules.provider],
      set: {
        inputPricePerToken: String(perMillionToPerToken(input.inputPricePerMillion)),
        outputPricePerToken: String(perMillionToPerToken(input.outputPricePerMillion)),
        currency: input.currency,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) throw new ApiError(500, "Failed to save pricing rule");
  return row;
}

export async function updatePricing(
  db: Database,
  projectId: string,
  id: string,
  input: z.infer<typeof pricingUpdateSchema>,
): Promise<PricingRuleRow> {
  const [existing] = await db
    .select()
    .from(pricingRules)
    .where(and(eq(pricingRules.id, id), eq(pricingRules.projectId, projectId)))
    .limit(1);
  if (!existing) throw notFound("Pricing rule not found");

  const [row] = await db
    .update(pricingRules)
    .set({
      ...(input.inputPricePerMillion !== undefined
        ? { inputPricePerToken: String(perMillionToPerToken(input.inputPricePerMillion)) }
        : {}),
      ...(input.outputPricePerMillion !== undefined
        ? { outputPricePerToken: String(perMillionToPerToken(input.outputPricePerMillion)) }
        : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(pricingRules.id, id), eq(pricingRules.projectId, projectId)))
    .returning();
  if (!row) throw notFound("Pricing rule not found");
  return row;
}

export async function deletePricing(
  db: Database,
  projectId: string,
  id: string,
): Promise<void> {
  const deleted = await db
    .delete(pricingRules)
    .where(and(eq(pricingRules.id, id), eq(pricingRules.projectId, projectId)))
    .returning({ id: pricingRules.id });
  if (deleted.length === 0) throw notFound("Pricing rule not found");
}

export type PricingResolver = (
  model: string | null | undefined,
  provider: string | null | undefined,
) => TokenPricing | null;

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Resolves project pricing with precedence:
 * model+provider → model+any → any+any. No pricing means "cost unavailable".
 */
export async function createPricingResolver(
  db: Database,
  projectId: string,
): Promise<PricingResolver> {
  const rules = await listPricing(db, projectId);
  const map = new Map<string, TokenPricing>();
  for (const rule of rules) {
    map.set(`${normalize(rule.model)}::${normalize(rule.provider)}`, {
      inputPricePerToken: Number(rule.inputPricePerToken),
      outputPricePerToken: Number(rule.outputPricePerToken),
      currency: rule.currency,
    });
  }
  return (model, provider) => {
    const modelKey = normalize(model);
    if (!modelKey) return null;
    return (
      map.get(`${modelKey}::${normalize(provider)}`) ??
      map.get(`${modelKey}::any`) ??
      map.get(`any::any`) ??
      null
    );
  };
}
