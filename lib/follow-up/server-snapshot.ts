import type { JsonValue } from "@/lib/patient-access/service";

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep only the episode actually used for this follow-up visit. */
export function selectFollowUpServerSnapshot(value: unknown, clinicalEpisodeId?: string): JsonValue | null {
  if (!isRecord(value)) return null;
  if (!clinicalEpisodeId || !Array.isArray(value.episodes)) return value;
  const episodes = value.episodes.filter((episode) =>
    isRecord(episode) && episode.episodeId === clinicalEpisodeId,
  );
  return { ...value, episodes };
}
