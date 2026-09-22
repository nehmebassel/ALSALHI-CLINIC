/*
  Warnings:

  - You are about to drop the column `clinicalServiceId` on the `Visit` table. All the data in the column will be lost.
  - You are about to drop the `OptionalProcedureRequest` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `role` to the `VisitReason` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VisitReasonRole" AS ENUM ('PRIMARY', 'ADDITIONAL');

-- DropForeignKey
ALTER TABLE "OptionalProcedureRequest" DROP CONSTRAINT "OptionalProcedureRequest_visitId_fkey";

-- DropForeignKey
ALTER TABLE "Visit" DROP CONSTRAINT "Visit_clinicalServiceId_fkey";

-- DropIndex
DROP INDEX "Visit_clinicalServiceId_idx";

-- AlterTable
ALTER TABLE "Visit" DROP COLUMN "clinicalServiceId";

-- AlterTable
ALTER TABLE "VisitReason" ADD COLUMN     "role" "VisitReasonRole" NOT NULL;

-- DropTable
DROP TABLE "OptionalProcedureRequest";

-- CreateTable
CREATE TABLE "AestheticProcedureDefinition" (
    "id" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AestheticProcedureDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaserServiceDefinition" (
    "id" UUID NOT NULL,
    "contentVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaserServiceDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitAestheticProcedureSelection" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "procedureDefinitionId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitAestheticProcedureSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitLaserServiceSelection" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "laserServiceDefinitionId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitLaserServiceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AestheticProcedureDefinition_contentVersionId_idx" ON "AestheticProcedureDefinition"("contentVersionId");

-- CreateIndex
CREATE INDEX "AestheticProcedureDefinition_isActive_idx" ON "AestheticProcedureDefinition"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AestheticProcedureDefinition_contentVersionId_code_key" ON "AestheticProcedureDefinition"("contentVersionId", "code");

-- CreateIndex
CREATE INDEX "LaserServiceDefinition_contentVersionId_idx" ON "LaserServiceDefinition"("contentVersionId");

-- CreateIndex
CREATE INDEX "LaserServiceDefinition_isActive_idx" ON "LaserServiceDefinition"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LaserServiceDefinition_contentVersionId_code_key" ON "LaserServiceDefinition"("contentVersionId", "code");

-- CreateIndex
CREATE INDEX "VisitAestheticProcedureSelection_visitId_idx" ON "VisitAestheticProcedureSelection"("visitId");

-- CreateIndex
CREATE INDEX "VisitAestheticProcedureSelection_procedureDefinitionId_idx" ON "VisitAestheticProcedureSelection"("procedureDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitAestheticProcedureSelection_visitId_procedureDefinitio_key" ON "VisitAestheticProcedureSelection"("visitId", "procedureDefinitionId");

-- CreateIndex
CREATE INDEX "VisitLaserServiceSelection_visitId_idx" ON "VisitLaserServiceSelection"("visitId");

-- CreateIndex
CREATE INDEX "VisitLaserServiceSelection_laserServiceDefinitionId_idx" ON "VisitLaserServiceSelection"("laserServiceDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitLaserServiceSelection_visitId_laserServiceDefinitionId_key" ON "VisitLaserServiceSelection"("visitId", "laserServiceDefinitionId");

-- CreateIndex
CREATE INDEX "VisitReason_role_idx" ON "VisitReason"("role");

-- AddForeignKey
ALTER TABLE "AestheticProcedureDefinition" ADD CONSTRAINT "AestheticProcedureDefinition_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaserServiceDefinition" ADD CONSTRAINT "LaserServiceDefinition_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitAestheticProcedureSelection" ADD CONSTRAINT "VisitAestheticProcedureSelection_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitAestheticProcedureSelection" ADD CONSTRAINT "VisitAestheticProcedureSelection_procedureDefinitionId_fkey" FOREIGN KEY ("procedureDefinitionId") REFERENCES "AestheticProcedureDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitLaserServiceSelection" ADD CONSTRAINT "VisitLaserServiceSelection_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitLaserServiceSelection" ADD CONSTRAINT "VisitLaserServiceSelection_laserServiceDefinitionId_fkey" FOREIGN KEY ("laserServiceDefinitionId") REFERENCES "LaserServiceDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
