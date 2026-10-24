-- CreateEnum
CREATE TYPE "RubricStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricSet" (
    "id" TEXT NOT NULL,
    "version" SERIAL NOT NULL,
    "status" "RubricStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceDocumentIds" TEXT[],
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubricSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_storagePath_key" ON "Document"("storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "RubricSet_version_key" ON "RubricSet"("version");

-- CreateIndex
CREATE INDEX "RubricSet_status_idx" ON "RubricSet"("status");

