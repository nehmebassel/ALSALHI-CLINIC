import { PlatformShell } from "@/app/components/platform/platform-shell";
import { PhysicianDashboard } from "@/app/physician/physician-dashboard";
import { requirePageActor } from "@/lib/auth/page-session";
import { getPhysicianQueue } from "@/lib/physician/read-model";
import { getPrismaClient } from "@/lib/prisma";
import { getPlatformLocale } from "@/lib/platform/locale";

export default async function PhysicianPage() {
  const actor = await requirePageActor("PHYSICIAN");
  const initialLocale = await getPlatformLocale();
  const prisma = getPrismaClient();
  const { queue, summary } = await getPhysicianQueue(prisma, actor.clinicScopeId);

  return (
    <PlatformShell userName={actor.userName ?? actor.userLogin ?? "User"} role="PHYSICIAN" initialLocale={initialLocale}>
      <PhysicianDashboard queue={queue} summary={summary} />
    </PlatformShell>
  );
}
