-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add nullable column first for data migration
ALTER TABLE "PlaylistItem" ADD COLUMN "playlistId" TEXT;

-- Data migration: assign existing items to a default playlist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PlaylistItem") THEN
    INSERT INTO "Playlist" ("id", "name", "isActive", "createdAt", "updatedAt")
    VALUES ('cldefaultplaylist0', 'Default', true, NOW(), NOW());
    UPDATE "PlaylistItem" SET "playlistId" = 'cldefaultplaylist0';
  END IF;
END $$;

-- AlterTable: make NOT NULL after data migration
ALTER TABLE "PlaylistItem" ALTER COLUMN "playlistId" SET NOT NULL;

-- DropIndex
DROP INDEX "PlaylistItem_order_idx";

-- CreateIndex
CREATE INDEX "PlaylistItem_playlistId_order_idx" ON "PlaylistItem"("playlistId", "order");

-- AddForeignKey
ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
