import { cookies } from "next/headers";

export type PlatformLocale = "ar" | "en";

export async function getPlatformLocale(): Promise<PlatformLocale> {
  const store = await cookies();
  return store.get("alsalhi_locale")?.value === "en" ? "en" : "ar";
}
