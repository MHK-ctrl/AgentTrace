import { buildServer } from "./app.js";
import { resolveConfig } from "./config.js";
import { createDatabase } from "./database/client.js";

async function main(): Promise<void> {
  const config = resolveConfig();
  const connection = createDatabase(config.databaseUrl);
  const app = await buildServer({ db: connection.db, config });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.warn(`Received ${signal}, shutting down`);
    try {
      await app.close();
      await connection.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.warn(`AgentTrace API listening on http://${config.host}:${config.port}`);
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Failed to start AgentTrace API:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
