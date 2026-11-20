import { resolveConfig } from "../config.js";
import { createDatabase } from "./client.js";
import { seedDemoDatabase } from "./seed.js";
import { generateApiKey } from "../utils/crypto.js";
import { ensureDemoKey } from "../services/api-keys.js";

const DEFAULT_DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const config = resolveConfig();
  const connection = createDatabase(config.databaseUrl, { max: 4 });
  const force = process.argv.includes("--force");
  const demoProjectId = process.env.AGENTTRACE_DEMO_PROJECT_ID || DEFAULT_DEMO_PROJECT_ID;

  let demoApiKey = process.env.AGENTTRACE_DEMO_API_KEY;
  const generated = !demoApiKey;
  if (!demoApiKey) {
    demoApiKey = generateApiKey().key;
  }

  try {
    const result = await seedDemoDatabase(connection.db, {
      demoProjectId,
      demoApiKey,
      force,
    });
    await ensureDemoKey(connection.db, result.projectId, demoApiKey);

    console.log("");
    console.log(`✓ ${result.projectName}`);
    console.log(`  project id: ${result.projectId}`);
    console.log(`  traces seeded: ${result.tracesCreated}`);
    console.log(`  pricing rules: ${result.pricingRules}`);
    console.log("");
    if (generated) {
      console.log("  Demo API key (store it in .env as AGENTTRACE_DEMO_API_KEY):");
      console.log(`  ${demoApiKey}`);
      console.log("");
    }
    if (result.tracesCreated === 0) {
      console.log("  Existing demo traces kept. Use `npm run db:seed -- --force` to reset demo data.");
      console.log("");
    }
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error("✗ Seeding failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
