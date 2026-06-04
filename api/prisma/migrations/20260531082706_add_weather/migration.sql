-- AlterEnum
ALTER TYPE "PlaylistItemType" ADD VALUE 'WEATHER';

-- CreateTable
CREATE TABLE "WeatherForecast" (
    "date" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "weatherId" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tempMin" DOUBLE PRECISION NOT NULL,
    "tempMax" DOUBLE PRECISION NOT NULL,
    "pop" DOUBLE PRECISION NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeatherForecast_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "WeatherForecast_dayOffset_idx" ON "WeatherForecast"("dayOffset");
