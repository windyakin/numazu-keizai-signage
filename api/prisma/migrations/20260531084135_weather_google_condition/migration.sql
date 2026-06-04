/*
  Warnings:

  - You are about to drop the column `weatherId` on the `WeatherForecast` table. All the data in the column will be lost.
  - Added the required column `condition` to the `WeatherForecast` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WeatherForecast" DROP COLUMN "weatherId",
ADD COLUMN     "condition" TEXT NOT NULL;
