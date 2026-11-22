import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { getDashboardActor } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const actor = await getDashboardActor();
  if (!actor) redirect("/login");
  return (
    <Providers>
      <AppShell user={actor.kind === "user" ? actor.user : null}>{children}</AppShell>
    </Providers>
  );
}
