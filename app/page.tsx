import { redirect } from "next/navigation";
import { getPageActor } from "@/lib/auth/page-session";

export default async function Home() {
  const actor = await getPageActor();
  redirect(actor ? (actor.role === "PHYSICIAN" ? "/physician" : "/staff") : "/login");
}
