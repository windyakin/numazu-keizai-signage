-- DropTable
DROP TABLE "AccessRanking";

-- AlterTable
ALTER TABLE "Article" DROP COLUMN "imageUrl",
ADD COLUMN     "imageKey" TEXT;

-- CreateTable
CREATE TABLE "AccessRanking" (
    "articleId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRanking_pkey" PRIMARY KEY ("articleId")
);

-- AddForeignKey
ALTER TABLE "AccessRanking" ADD CONSTRAINT "AccessRanking_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
