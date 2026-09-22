/*
  Warnings:

  - Added the required column `contentVersionId` to the `DraftClinicalInterview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DraftClinicalInterview" ADD COLUMN     "contentVersionId" UUID NOT NULL;

-- CreateTable
CREATE TABLE "ContentVersionRuleVersion" (
    "contentVersionId" UUID NOT NULL,
    "ruleVersionId" UUID NOT NULL,

    CONSTRAINT "ContentVersionRuleVersion_pkey" PRIMARY KEY ("contentVersionId","ruleVersionId")
);

-- CreateIndex
CREATE INDEX "ContentVersionRuleVersion_ruleVersionId_idx" ON "ContentVersionRuleVersion"("ruleVersionId");

-- CreateIndex
CREATE INDEX "DraftClinicalInterview_contentVersionId_idx" ON "DraftClinicalInterview"("contentVersionId");

-- AddForeignKey
ALTER TABLE "DraftClinicalInterview" ADD CONSTRAINT "DraftClinicalInterview_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersionRuleVersion" ADD CONSTRAINT "ContentVersionRuleVersion_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersionRuleVersion" ADD CONSTRAINT "ContentVersionRuleVersion_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
