import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoProvider } from "@/components/demo-provider";
import { DemoShell } from "@/components/demo-shell";
import { requireDemoSession } from "@/lib/demo-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "Explore real AgentTrace traces, live execution monitoring, token analytics, comparison and playback in an isolated synthetic demo.",
  robots: { index: false, follow: true },
};

export default async function PublicDemoLayout({ children }: { children: ReactNode }) {
  const resolved = await requireDemoSession();
  return (
    <DemoProvider session={resolved.session}>
      <DemoShell>{children}</DemoShell>
    </DemoProvider>
  );
}
