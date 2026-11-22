import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.AGENTTRACE_DASHBOARD_URL ??
      process.env.RENDER_EXTERNAL_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000",
  ),
  title: {
    default: "AgentTrace — See Everything Your AI Agents Do",
    template: "%s · AgentTrace",
  },
  description:
    "Open-source observability and debugging for AI agents. Inspect execution traces, visualize tool calls, track token consumption and understand failures.",
  applicationName: "AgentTrace",
  keywords: [
    "AI agents",
    "observability",
    "AI observability",
    "distributed tracing",
    "LLM",
    "developer tools",
    "TypeScript",
  ],
  authors: [{ name: "AgentTrace contributors" }],
  creator: "AgentTrace",
  openGraph: {
    type: "website",
    siteName: "AgentTrace",
    title: "AgentTrace — See Everything Your AI Agents Do",
    description:
      "Open-source observability and debugging for AI agents. Trace tool calls, token usage, failures and retries in one local-first control plane.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentTrace — See Everything Your AI Agents Do",
    description:
      "Open-source observability and debugging for AI agents. Explore a live trace demo and inspect the TypeScript SDK.",
  },
  robots: { index: true, follow: true },
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("agenttrace-theme");
    var dark = stored ? stored === "dark" : true;
    document.documentElement.classList.toggle("light", !dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
