-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('UPLOADED', 'TRANSCRIBING', 'TRANSCRIBED', 'ANALYZING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "durationSec" INTEGER,
    "status" "CallStatus" NOT NULL DEFAULT 'UPLOADED',
    "assemblyId" TEXT,
    "transcript" JSONB,
    "agentSpeaker" TEXT,
    "category" TEXT,
    "subtype" TEXT,
    "direction" TEXT,
    "repName" TEXT,
    "outcome" TEXT,
    "outcomeReason" TEXT,
    "summary" TEXT,
    "details" JSONB,
    "coaching" JSONB,
    "score" DOUBLE PRECISION,
    "callDate" TIMESTAMP(3),
    "failedStage" TEXT,
    "errorDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionResult" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "evidence" TEXT,
    "utterance" INTEGER,

    CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Call_status_idx" ON "Call"("status");

-- CreateIndex
CREATE INDEX "Call_category_outcome_idx" ON "Call"("category", "outcome");

-- CreateIndex
CREATE INDEX "Call_repName_idx" ON "Call"("repName");

-- CreateIndex
CREATE INDEX "CriterionResult_criterionId_result_idx" ON "CriterionResult"("criterionId", "result");

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
