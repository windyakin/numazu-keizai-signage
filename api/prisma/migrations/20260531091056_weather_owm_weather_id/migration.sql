/*
  Warnings:

  - You are about to drop the column `condition` on the `WeatherForecast` table. All the data in the column will be lost.
  - Added the required column `weatherId` to the `WeatherForecast` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WeatherForecast" DROP COLUMN "condition",
ADD COLUMN     "weatherId" INTEGER NOT NULL;
