import { prisma } from "../db.js";
import { cacheArticleImage } from "./articleImage.js";

interface RankingItem {
  id: string;
  title: string;
  image: string;
  photo: string;
  start: string;
  rank: string;
  categories: { id: string; name: string; name_jp: string }[];
}

interface RankingsResponse {
  items: RankingItem[];
  cp: {
    category: string;
    limit: number;
    from: number;
    next: string;
  };
}

export async function fetchRankings(): Promise<number> {
  const rankingsUrl = process.env.ACCESS_URL;
  const imageBaseUrl = process.env.FEED_IMAGE_BASE_URL;

  if (!rankingsUrl) {
    throw new Error("ACCESS_URL is not set");
  }
  if (!imageBaseUrl) {
    throw new Error("FEED_IMAGE_BASE_URL is not set");
  }

  const response = await fetch(rankingsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: "mode=async&category=access&limit=15&from=1",
  });
  if (!response.ok) {
    throw new Error(`Rankings fetch failed: ${response.status} ${response.statusText}`);
  }

  const data: RankingsResponse = await response.json();

  // 既存のランキングを全削除して入れ替え
  await prisma.accessRanking.deleteMany();

  for (const item of data.items) {
    const start = new Date(item.start.replace(" ", "T") + "+09:00");
    const sourceFilename = item.photo || item.image;

    // ランキングは記事フィードの取得範囲外の過去記事を含む可能性があるため、
    // Article 側を upsert で確保する。既存記事は最小限の変更にとどめる。
    const existing = await prisma.article.findUnique({ where: { id: item.id } });
    if (!existing) {
      const mediaFileId = await cacheArticleImage(item.id, sourceFilename);
      await prisma.article.create({
        data: {
          id: item.id,
          title: item.title,
          mediaFileId,
          start,
          description: null,
        },
      });
    } else if (existing.mediaFileId === null) {
      // 過去取得失敗からのリカバリ: 既存 Article を尊重しつつ mediaFileId だけ補填
      const mediaFileId = await cacheArticleImage(item.id, sourceFilename);
      if (mediaFileId !== null) {
        await prisma.article.update({
          where: { id: item.id },
          data: { mediaFileId },
        });
      }
    }

    await prisma.accessRanking.create({
      data: {
        articleId: item.id,
        rank: parseInt(item.rank, 10),
      },
    });
  }

  return data.items.length;
}

export function startRankingsJob(): void {
  const intervalMin = parseInt(process.env.FEED_FETCH_INTERVAL_MIN || "30", 10);

  // 起動時に1回即時実行
  fetchRankings()
    .then((count) => console.log(`[rankingsFetcher] Initial fetch: ${count} rankings`))
    .catch((err) => console.error("[rankingsFetcher] Initial fetch failed:", err));

  // 定期実行
  setInterval(() => {
    fetchRankings()
      .then((count) => console.log(`[rankingsFetcher] Fetched ${count} rankings`))
      .catch((err) => console.error("[rankingsFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
