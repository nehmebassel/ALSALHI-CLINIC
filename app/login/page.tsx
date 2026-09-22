import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/auth/page-session";
import { getPlatformLocale } from "@/lib/platform/locale";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const actor = await getPageActor();
  if (actor) redirect(actor.role === "PHYSICIAN" ? "/physician" : "/staff");
  const initialLocale = await getPlatformLocale();
  return <LoginForm initialLocale={initialLocale} />;
}
