import { AgentTrace } from "agenttrace-sdk";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const apiKey = process.env.AGENTTRACE_DEMO_API_KEY;
const endpoint =
  process.env.AGENTTRACE_ENDPOINT ?? process.env.AGENTTRACE_API_URL ?? "http://localhost:4000";
const dashboardUrl = process.env.AGENTTRACE_DASHBOARD_URL ?? "http://localhost:3000";

if (!apiKey) {
  console.error("AGENTTRACE_DEMO_API_KEY is not set. Run `npm run setup` first.");
  process.exit(1);
}

const agenttrace = new AgentTrace({
  apiKey,
  endpoint,
  captureInputOutput: true,
  tags: ["example-agent", "support"],
  onError: (error) => console.error(`[agenttrace] ${error.message}`),
});

const ticket = {
  id: "TICKET-4821",
  customerId: "CUST-1042",
  message: "I was charged twice for order 4821. Can I get a refund?",
};

async function main() {
  const traceId = await agenttrace.trace(
    {
      name: "Example support agent · duplicate charge",
      agentName: "example-support-agent",
      metadata: { runtime: "examples/basic-agent", ticketId: ticket.id },
      isDemo: true,
    },
    async (trace) => {
      const plan = await trace.llm(
        {
          name: "plan-resolution",
          model: "demo-reasoner",
          provider: "agenttrace-sim",
          input: { message: ticket.message },
          tokenUsage: { input: 786, output: 152 },
        },
        async (span) => {
          span.setAttributes({ intent: "billing_refund" });
          span.event("plan-ready", { nextAction: "lookup_customer" });
          return { intent: "billing_refund", needsLookup: true };
        },
      );

      await trace.tool(
        {
          name: "browser.search",
          input: { query: "duplicate charge refund policy" },
          attributes: { "tool.vendor": "example-search" },
        },
        async () => ({ resultCount: 3, topSource: "docs.example.com" }),
      );

      await trace.database(
        {
          name: "crm.customer-lookup",
          attemptNumber: 1,
          input: { customerId: ticket.customerId },
          swallowErrors: true,
        },
        async () => {
          throw new Error("connection reset by peer");
        },
      );

      const customer = await trace.database(
        {
          name: "retry · crm.customer-lookup",
          attemptNumber: 2,
          input: { customerId: ticket.customerId },
          attributes: { "retry.attempt": 2 },
        },
        async () => ({ customerId: ticket.customerId, plan: "enterprise", duplicateCharge: true }),
      );

      const reply = await trace.llm(
        {
          name: "draft-reply",
          model: "demo-reasoner",
          provider: "agenttrace-sim",
          input: { customerId: customer.customerId, duplicateCharge: customer.duplicateCharge },
          tokenUsage: { input: 1_302, output: 214 },
        },
        async (span) => {
          span.setOutput({
            text: "I found the duplicate charge and issued a refund to the original payment method.",
            confidence: 0.97,
          });
          return "draft-ready";
        },
      );

      trace.setMetadata({ outcome: reply, refundIssued: true, plannedIntent: plan.intent });
      return trace.id;
    },
  );

  await agenttrace.shutdown();

  console.log(`Recorded trace ${traceId}`);
  console.log(`Open it at ${dashboardUrl}/traces/${traceId}`);
}

main().catch(async (error) => {
  console.error(error);
  await agenttrace.shutdown().catch(() => undefined);
  process.exitCode = 1;
});
