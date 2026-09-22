import { PlatformShell } from "@/app/components/platform/platform-shell";
import { StaffWorkspace } from "@/app/staff/staff-workspace";
import { requirePageActor } from "@/lib/auth/page-session";
import { getPlatformLocale } from "@/lib/platform/locale";

export default async function StaffPage() {
  const actor = await requirePageActor("STAFF");
  const initialLocale = await getPlatformLocale();
  return (
    <PlatformShell userName={(actor.userName ?? actor.userLogin ?? "User") } role="STAFF" initialLocale={initialLocale}>
      <StaffWorkspace />
    </PlatformShell>
  );
}
