import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export interface ApiConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  databaseUrl: string;
  dashboardToken: string;
  dashboardUrl: string;
  corsOrigins: string[];
  version: string;
  isProduction: boolean;
  trustProxy: boolean;
  publicDemoEnabled: boolean;
  demoSessionTtlHours: number;
  demoMaxRuns: number;
  demoCooldownSeconds: number;
  demoMaxConcurrentRuns: number;
}

function integerEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseOrigins(value: string | undefined): string[] {
  if (!value) return ["http://localhost:3000"];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as ApiConfig["nodeEnv"];
  const dashboardToken = process.env.AGENTTRACE_DASHBOARD_TOKEN ?? "";
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isProduction = nodeEnv === "production";

  const config: ApiConfig = {
    nodeEnv,
    port: Number(process.env.AGENTTRACE_API_PORT ?? process.env.PORT ?? 4000),
    host: process.env.AGENTTRACE_API_HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1"),
    databaseUrl,
    dashboardToken,
    dashboardUrl: process.env.AGENTTRACE_DASHBOARD_URL ?? "http://localhost:3000",
    corsOrigins: parseOrigins(process.env.AGENTTRACE_CORS_ORIGINS),
    version: "0.1.0",
    isProduction,
    trustProxy: isProduction,
    publicDemoEnabled: process.env.AGENTTRACE_PUBLIC_DEMO !== "0",
    demoSessionTtlHours: integerEnv(process.env.AGENTTRACE_DEMO_TTL_HOURS, 24, 1, 72),
    demoMaxRuns: integerEnv(process.env.AGENTTRACE_DEMO_MAX_RUNS, 8, 1, 50),
    demoCooldownSeconds: integerEnv(process.env.AGENTTRACE_DEMO_COOLDOWN_SECONDS, 3, 0, 60),
    demoMaxConcurrentRuns: integerEnv(process.env.AGENTTRACE_DEMO_MAX_CONCURRENT, 3, 1, 20),
    ...overrides,
  };

  if (config.nodeEnv !== "test") {
    if (!config.databaseUrl) {
      throw new Error(
        "DATABASE_URL is not set. Run `npm run setup` or copy .env.example to .env and configure PostgreSQL.",
      );
    }
    if (!config.dashboardToken || config.dashboardToken.length < 16) {
      throw new Error(
        "AGENTTRACE_DASHBOARD_TOKEN is missing or too short. Run `npm run setup` to generate one.",
      );
    }
  }

  return config;
}

export const config = resolveConfig();
