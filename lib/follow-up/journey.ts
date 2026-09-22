import type { P01SectionCode } from "@/lib/p01/contracts";
import type { P01FollowUpContext } from "@/lib/follow-up/types";

const EXISTING_FOLLOW_UP_REGISTRY_SECTIONS = new Set<P01SectionCode>([
  "PRIVACY",
  "LASER",
  "AESTHETIC_PROCEDURES",
]);

function uniqueSections(sections: P01SectionCode[]): P01SectionCode[] {
  return [...new Set(sections)];
}

/**
 * Hard journey boundary for a returning patient following an existing episode.
 *
 * The Initial Intake registry is never used as the follow-up questionnaire.
 * After the dedicated delta/current-state steps, the only registry sections
 * that may open are a newly requested Laser/Aesthetic ADDITIONAL mini pathway.
 *
 * NEW_CONCERN still uses the normal governed new-concern pathway. The engine
 * separately suppresses identity/history already owned by the longitudinal
 * patient record.
 */
export function followUpJourneySections(
  visibleSections: P01SectionCode[],
  context: P01FollowUpContext | null | undefined,
): P01SectionCode[] {
  const sections = uniqueSections(visibleSections);
  if (!context) return sections;
  if (context.intent !== "EXISTING_CONCERN") return sections;
  return sections.filter((section) => EXISTING_FOLLOW_UP_REGISTRY_SECTIONS.has(section));
}

export function isAllowedExistingFollowUpRegistrySection(section: P01SectionCode): boolean {
  return EXISTING_FOLLOW_UP_REGISTRY_SECTIONS.has(section);
}

export function firstFollowUpRegistrySection(
  visibleSections: P01SectionCode[],
  context: P01FollowUpContext | null | undefined,
): P01SectionCode | null {
  const sections = followUpJourneySections(visibleSections, context);
  return sections.find((section) => !["PRIVACY", "VISIT_REASON"].includes(section)) ?? null;
}
