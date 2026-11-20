import { resolveConfig } from "../config.js";
import { createDatabase } from "./client.js";
import { runMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const config = resolveConfig();
  const connection = createDatabase(config.databaseUrl, { max: 1 });
  try {
    await runMigrations(connection.db);
    console.log("✓ Database migrations applied");
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error("✗ Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
