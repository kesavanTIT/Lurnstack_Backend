-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TRAINER');

-- AlterTable: drop existing role column and recreate as Role enum with STUDENT default
ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STUDENT';
