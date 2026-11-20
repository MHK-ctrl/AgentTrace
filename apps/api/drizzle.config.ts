import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL(".env", import.meta.url)), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/agenttrace";
const apiRoot = fileURLToPath(new URL(".", import.meta.url));
const fromCwd = (target: string) => path.relative(process.cwd(), path.join(apiRoot, target));

export default defineConfig({
  schema: fromCwd("src/database/schema.ts"),
  out: fromCwd("drizzle"),
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
