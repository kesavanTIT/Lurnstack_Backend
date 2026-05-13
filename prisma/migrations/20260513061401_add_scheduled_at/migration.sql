-- AlterTable
ALTER TABLE "LiveClass" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
