-- CreateTable
CREATE TABLE "AccessRanking" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRanking_pkey" PRIMARY KEY ("id")
);
