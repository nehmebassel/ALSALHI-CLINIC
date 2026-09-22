import { notFound } from "next/navigation";

import { PlatformShell } from "@/app/components/platform/platform-shell";
import { PhysicianPatientWorkspace } from "@/app/physician/patients/[patientId]/physician-patient-workspace";
import { requirePageActor } from "@/lib/auth/page-session";
import { getPhysicianPatientWorkspace } from "@/lib/physician/read-model";
import { getPlatformLocale } from "@/lib/platform/locale";
import { getPrismaClient } from "@/lib/prisma";

export default async function PhysicianPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const actor = await requirePageActor("PHYSICIAN");
  const initialLocale = await getPlatformLocale();
  const { patientId } = await params;
  const data = await getPhysicianPatientWorkspace(getPrismaClient(), actor.clinicScopeId, patientId);
  if (!data) notFound();

  return (
    <PlatformShell userName={actor.userName ?? actor.userLogin ?? "User"} role="PHYSICIAN" initialLocale={initialLocale}>
      <PhysicianPatientWorkspace data={data} />
    </PlatformShell>
  );
}
