-- AlterEnum
ALTER TYPE "MediaFileType" ADD VALUE 'ARTICLE';

-- AlterTable
ALTER TABLE "Article" DROP COLUMN "imageKey",
ADD COLUMN     "mediaFileId" TEXT;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_mediaFileId_fkey" FOREIGN KEY ("mediaFileId") REFERENCES "MediaFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
