/*
  Warnings:

  - A unique constraint covering the columns `[contentVersionId,code]` on the table `ReasonForVisitDefinition` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contentVersionId` to the `ReasonForVisitDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ReasonForVisitDefinition_code_key";

-- AlterTable
ALTER TABLE "ReasonForVisitDefinition" ADD COLUMN     "contentVersionId" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "ReasonForVisitDefinition_contentVersionId_idx" ON "ReasonForVisitDefinition"("contentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReasonForVisitDefinition_contentVersionId_code_key" ON "ReasonForVisitDefinition"("contentVersionId", "code");

-- AddForeignKey
ALTER TABLE "ReasonForVisitDefinition" ADD CONSTRAINT "ReasonForVisitDefinition_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
