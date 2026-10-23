/*
  Warnings:

  - A unique constraint covering the columns `[audioPath]` on the table `Call` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[callId,criterionId]` on the table `CriterionResult` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "rubricVersion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Call_audioPath_key" ON "Call"("audioPath");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionResult_callId_criterionId_key" ON "CriterionResult"("callId", "criterionId");
