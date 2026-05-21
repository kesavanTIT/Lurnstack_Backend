/*
  Warnings:

  - You are about to drop the column `category` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `classTitle` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `courseTitle` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `durationMinutes` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `endsAt` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledAt` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledDate` on the `LiveSession` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnail` on the `LiveSession` table. All the data in the column will be lost.
  - Added the required column `courseId` to the `LiveSession` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `LiveSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "LiveClass" ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceType" TEXT;

-- AlterTable
ALTER TABLE "LiveSession" DROP COLUMN "category",
DROP COLUMN "classTitle",
DROP COLUMN "courseTitle",
DROP COLUMN "durationMinutes",
DROP COLUMN "endsAt",
DROP COLUMN "scheduledAt",
DROP COLUMN "scheduledDate",
DROP COLUMN "thumbnail",
ADD COLUMN     "cancelledDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "courseId" TEXT NOT NULL,
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recurrenceType" TEXT,
ADD COLUMN     "subtitle" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
ADD COLUMN     "title" TEXT NOT NULL,
ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE "SessionCard" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionBooking" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "meetingLink" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "joinDate" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'joined',

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionCard_sessionId_studentId_key" ON "SessionCard"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionBooking_sessionId_studentId_key" ON "SessionBooking"("sessionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_studentId_joinDate_key" ON "Attendance"("sessionId", "studentId", "joinDate");

-- AddForeignKey
ALTER TABLE "SessionCard" ADD CONSTRAINT "SessionCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCard" ADD CONSTRAINT "SessionCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionBooking" ADD CONSTRAINT "SessionBooking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionBooking" ADD CONSTRAINT "SessionBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
