-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rep" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Rep_companyId_name_key" ON "Rep"("companyId", "name");

-- AddForeignKey
ALTER TABLE "Rep" ADD CONSTRAINT "Rep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the demo companies and their known reps
INSERT INTO "Company" ("id", "name") VALUES
    (gen_random_uuid()::text, 'Bug Bully'),
    (gen_random_uuid()::text, 'Endeavor Pest Management');

INSERT INTO "Rep" ("id", "companyId", "name")
SELECT gen_random_uuid()::text, c."id", r."name"
FROM (VALUES ('Bug Bully', 'Griffin'), ('Bug Bully', 'Mike'), ('Endeavor Pest Management', 'Elijah')) AS r("company", "name")
JOIN "Company" c ON c."name" = r."company";

-- AlterTable: existing calls are all Bug Bully recordings
ALTER TABLE "Call" ADD COLUMN "companyId" TEXT, ADD COLUMN "repId" TEXT;
UPDATE "Call" SET "companyId" = (SELECT "id" FROM "Company" WHERE "name" = 'Bug Bully');
UPDATE "Call" SET "repId" = r."id" FROM "Rep" r WHERE r."companyId" = "Call"."companyId" AND r."name" = "Call"."repName";
ALTER TABLE "Call" ALTER COLUMN "companyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Call_companyId_createdAt_idx" ON "Call"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_repId_fkey" FOREIGN KEY ("repId") REFERENCES "Rep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
