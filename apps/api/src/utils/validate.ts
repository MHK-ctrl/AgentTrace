import { z } from "zod";
import { badRequest } from "./errors.js";
import { formatZodError } from "./errors.js";

export function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw badRequest("Request validation failed", formatZodError(result.error));
  }
  return result.data;
}

export const projectIdQuerySchema = z.object({
  projectId: z.string().uuid("A valid projectId is required"),
});

export const traceParamsSchema = z.object({
  traceId: z.string().min(1).max(128),
});
