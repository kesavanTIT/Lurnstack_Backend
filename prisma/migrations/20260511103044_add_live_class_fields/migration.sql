/*
  Warnings:

  - You are about to drop the column `scheduledAt` on the `LiveClass` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `LiveClass` table. All the data in the column will be lost.
  - Added the required column `classTitle` to the `LiveClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `courseName` to the `LiveClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `LiveClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `duration` to the `LiveClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `instructor` to the `LiveClass` table without a default value. This is not possible if the table is not empty.
  - Added the required column `time` to the `LiveClass` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LiveClass" DROP COLUMN "scheduledAt",
DROP COLUMN "title",
ADD COLUMN     "classTitle" TEXT NOT NULL,
ADD COLUMN     "courseName" TEXT NOT NULL,
ADD COLUMN     "date" TEXT NOT NULL,
ADD COLUMN     "duration" TEXT NOT NULL,
ADD COLUMN     "instructor" TEXT NOT NULL,
ADD COLUMN     "thumbnail" TEXT,
ADD COLUMN     "time" TEXT NOT NULL;
