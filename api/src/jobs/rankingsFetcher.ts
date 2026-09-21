import { parse } from "node-html-parser";
import { prisma } from "../db.js";
import { cacheArticleImage } from "./articleImage.js";
import { fetchArticlePageMeta } from "./articlesFetcher.js";

interface RankingItem {
  rank: number;
  articleId: string;
  articleUrl: string;
  imageUrl: string | null;
  title: string;
}

function parseAccessPage(html: string): RankingItem[] {
  const root = parse(html);
  const items: RankingItem[] = [];

  for (const li of root.querySelectorAll("#accessItems li")) {
    const anchor = li.querySelector("a[data-id]");
    if (!anchor) continue;

    const rank = parseInt(anchor.getAttribute("data-id") ?? "", 10);
    if (isNaN(rank)) continue;

    const href = anchor.getAttribute("href") ?? "";
    const idMatch = href.match(/\/headline\/(\d+)\/?/);
    if (!idMatch) continue;

    const imageUrl = li.querySelector("img")?.getAttribute("src") ?? null;
    const title = li.querySelector("h2")?.text?.trim() ?? "";

    items.push({
      rank,
      articleId: idMatch[1],
      articleUrl: href.replace(/^http:/, "https:"),
      imageUrl,
      title,
    });
  }

  return items;
}

export async function fetchRankings(): Promise<number> {
  const accessUrl = process.env.ACCESS_URL;
  if (!accessUrl) {
    throw new Error("ACCESS_URL is not set");
  }

  const response = await fetch(accessUrl);
  if (!response.ok) {
    throw new Error(`Rankings fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const items = parseAccessPage(html);

  await prisma.accessRanking.deleteMany();

  for (const item of items) {
    const existing = await prisma.article.findUnique({ where: { id: item.articleId } });

    if (!existing) {
      // DB に存在しない記事: 記事ページからメタ情報を取得して Article を作成
      const meta = await fetchArticlePageMeta(item.articleUrl);
      const imageUrl = meta.imageUrl ?? item.imageUrl;
      const mediaFileId = imageUrl ? await cacheArticleImage(item.articleId, imageUrl) : null;

      await prisma.article.create({
        data: {
          id: item.articleId,
          title: meta.title ?? item.title,
          mediaFileId,
          start: meta.start ?? new Date(),
          description: meta.description,
        },
      });
    } else if (existing.mediaFileId === null && item.imageUrl) {
      const mediaFileId = await cacheArticleImage(item.articleId, item.imageUrl);
      if (mediaFileId !== null) {
        await prisma.article.update({
          where: { id: item.articleId },
          data: { mediaFileId },
        });
      }
    }

    await prisma.accessRanking.create({
      data: {
        articleId: item.articleId,
        rank: item.rank,
      },
    });
  }

  return items.length;
}

export function startRankingsJob(): void {
  const intervalMin = parseInt(process.env.FEED_FETCH_INTERVAL_MIN || "30", 10);

  fetchRankings()
    .then((count) => console.log(`[rankingsFetcher] Initial fetch: ${count} rankings`))
    .catch((err) => console.error("[rankingsFetcher] Initial fetch failed:", err));

  setInterval(() => {
    fetchRankings()
      .then((count) => console.log(`[rankingsFetcher] Fetched ${count} rankings`))
      .catch((err) => console.error("[rankingsFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
