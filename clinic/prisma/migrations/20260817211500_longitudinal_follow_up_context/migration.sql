CREATE TABLE "FollowUpSessionContext" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "contextVersion" TEXT NOT NULL,
    "contextJson" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FollowUpSessionContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClinicalEpisodeFollowUpProfile" (
    "id" UUID NOT NULL,
    "clinicalEpisodeId" UUID NOT NULL,
    "sourceVisitId" UUID NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "routingJson" JSONB NOT NULL,
    "patientVisibleSummaryJson" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalEpisodeFollowUpProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowUpSessionContext_sessionId_key" ON "FollowUpSessionContext"("sessionId");
CREATE INDEX "FollowUpSessionContext_patientId_idx" ON "FollowUpSessionContext"("patientId");
CREATE INDEX "FollowUpSessionContext_generatedAt_idx" ON "FollowUpSessionContext"("generatedAt");
CREATE UNIQUE INDEX "ClinicalEpisodeFollowUpProfile_clinicalEpisodeId_key" ON "ClinicalEpisodeFollowUpProfile"("clinicalEpisodeId");
CREATE INDEX "ClinicalEpisodeFollowUpProfile_sourceVisitId_idx" ON "ClinicalEpisodeFollowUpProfile"("sourceVisitId");
CREATE INDEX "ClinicalEpisodeFollowUpProfile_updatedByUserId_idx" ON "ClinicalEpisodeFollowUpProfile"("updatedByUserId");
CREATE INDEX "ClinicalEpisodeFollowUpProfile_approvedAt_idx" ON "ClinicalEpisodeFollowUpProfile"("approvedAt");

ALTER TABLE "FollowUpSessionContext" ADD CONSTRAINT "FollowUpSessionContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PatientAccessSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpSessionContext" ADD CONSTRAINT "FollowUpSessionContext_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalEpisodeFollowUpProfile" ADD CONSTRAINT "ClinicalEpisodeFollowUpProfile_clinicalEpisodeId_fkey" FOREIGN KEY ("clinicalEpisodeId") REFERENCES "ClinicalEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalEpisodeFollowUpProfile" ADD CONSTRAINT "ClinicalEpisodeFollowUpProfile_sourceVisitId_fkey" FOREIGN KEY ("sourceVisitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalEpisodeFollowUpProfile" ADD CONSTRAINT "ClinicalEpisodeFollowUpProfile_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
