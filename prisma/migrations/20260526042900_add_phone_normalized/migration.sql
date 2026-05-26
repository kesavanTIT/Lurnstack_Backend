-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneNormalized" TEXT;

-- Backfill phoneNormalized from existing phoneNumber by stripping non-digits
UPDATE "User" SET "phoneNormalized" = REGEXP_REPLACE("phoneNumber", '[^0-9]', '', 'g') WHERE "phoneNumber" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNormalized_key" ON "User"("phoneNormalized");
