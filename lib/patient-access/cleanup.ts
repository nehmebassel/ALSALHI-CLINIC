import type { PrismaClient } from "@/app/generated/prisma/client";
import { getPrismaClient } from "@/lib/prisma";

/**
 * Purges temporary clinical input and MRN values after the approved 24-hour
 * terminal-Draft window. Existing permanent Patient rows are never deleted.
 */
export async function purgeTerminalDraftData(
  now: Date,
  prisma: PrismaClient = getPrismaClient(),
): Promise<number> {
  const drafts = await prisma.draftClinicalInterview.findMany({
    where: {
      status: {
        in: ["CANCELLED", "EXPIRED"],
      },
      purgeAfter: {
        lte: now,
      },
      purgedAt: null,
    },
    select: {
      id: true,
      session: {
        select: {
          invitationId: true,
        },
      },
    },
  });

  for (const draft of drafts) {
    await prisma.$transaction([
      prisma.draftClinicalInterview.update({
        where: { id: draft.id },
        data: {
          patientInputJson: {},
          purgedAt: now,
          purgeAfter: null,
        },
      }),
      prisma.interviewInvitation.update({
        where: { id: draft.session.invitationId },
        data: {
          temporaryMrnDisplayValue: null,
          temporaryMrnNormalizedValue: null,
        },
      }),
    ]);
  }

  return drafts.length;
}
