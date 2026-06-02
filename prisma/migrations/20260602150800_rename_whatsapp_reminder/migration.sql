-- RenameTable
ALTER TABLE "WhatsAppSessionReminderLog" RENAME TO "WhatsAppReminder";

-- AlterTable
ALTER TABLE "WhatsAppReminder" ADD COLUMN "reminderType" TEXT NOT NULL DEFAULT 'session_reminder_30min';

-- RenameConstraint
ALTER TABLE "WhatsAppReminder" RENAME CONSTRAINT "WhatsAppSessionReminderLog_pkey" TO "WhatsAppReminder_pkey";
ALTER TABLE "WhatsAppReminder" RENAME CONSTRAINT "WhatsAppSessionReminderLog_sessionId_fkey" TO "WhatsAppReminder_sessionId_fkey";
ALTER TABLE "WhatsAppReminder" RENAME CONSTRAINT "WhatsAppSessionReminderLog_userId_fkey" TO "WhatsAppReminder_userId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "WhatsAppSessionReminderLog_sessionId_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppReminder_sessionId_userId_reminderType_key" ON "WhatsAppReminder"("sessionId", "userId", "reminderType");
