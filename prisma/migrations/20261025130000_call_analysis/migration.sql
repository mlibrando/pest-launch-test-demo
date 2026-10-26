-- AlterTable
ALTER TABLE "Call" DROP COLUMN "rubricVersion",
ADD COLUMN     "analysisProgress" JSONB,
ADD COLUMN     "analysisRaw" JSONB,
ADD COLUMN     "analysisWarnings" JSONB,
ADD COLUMN     "maxPoints" INTEGER,
ADD COLUMN     "points" INTEGER,
ADD COLUMN     "rubricSetId" TEXT,
ADD COLUMN     "scorecard" TEXT,
ADD COLUMN     "tier" TEXT;

-- AlterTable
ALTER TABLE "CriterionResult" DROP COLUMN "evidence",
DROP COLUMN "utterance",
ADD COLUMN     "quotes" JSONB,
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MODEL';

-- Existing rows came from the old model-only test script; the default only backfills them
ALTER TABLE "CriterionResult" ALTER COLUMN "source" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PolicyViolation" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "policyIndex" INTEGER NOT NULL,
    "rule" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "quotes" JSONB NOT NULL,

    CONSTRAINT "PolicyViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyViolation_callId_idx" ON "PolicyViolation"("callId");

-- CreateIndex
CREATE INDEX "Call_rubricSetId_idx" ON "Call"("rubricSetId");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_rubricSetId_fkey" FOREIGN KEY ("rubricSetId") REFERENCES "RubricSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyViolation" ADD CONSTRAINT "PolicyViolation_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

