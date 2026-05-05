import { parse } from "node-html-parser";
import { prisma } from "../db.js";

async function fetchArticleDescription(feedUrl: string, id: string): Promise<string | null> {
  const articleUrl = `${feedUrl.replace(/\/+$/, "")}/${id}/`;
  try {
    const res = await fetch(articleUrl);
    if (!res.ok) return null;
    const root = parse(await res.text());
    return root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
  } catch {
    return null;
  }
}

interface FeedItem {
  id: string;
  title: string;
  image: string;
  photo: string;
  ytid: string | null;
  start: string;
  published: string | null;
}

interface FeedResponse {
  items: FeedItem[];
  cp: {
    category: string;
    limit: number;
    from: number;
    next: string;
  };
}

export async function fetchFeed(): Promise<number> {
  const feedUrl = process.env.FEED_URL;
  const imageBaseUrl = process.env.FEED_IMAGE_BASE_URL;

  if (!feedUrl) {
    throw new Error("FEED_URL is not set");
  }
  if (!imageBaseUrl) {
    throw new Error("FEED_IMAGE_BASE_URL is not set");
  }

  const response = await fetch(feedUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: "mode=async&category=headline&limit=15&from=1",
  });
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
  }

  const data: FeedResponse = await response.json();

  for (const item of data.items) {
    const imageUrl = item.image
      ? `${imageBaseUrl.replace(/\/+$/, "")}/${item.image.replace(/^\/+/, "")}`
      : "";
    const start = new Date(item.start.replace(" ", "T") + "+09:00");

    await prisma.article.upsert({
      where: { id: item.id },
      update: {
        title: item.title,
        imageUrl,
        start,
        fetchedAt: new Date(),
      },
      create: {
        id: item.id,
        title: item.title,
        imageUrl,
        start,
        fetchedAt: new Date(),
      },
    });
  }

  // description が未取得の記事を逐次フェッチ
  const noDesc = await prisma.article.findMany({ where: { description: null } });
  for (const article of noDesc) {
    const description = await fetchArticleDescription(feedUrl, article.id);
    if (description !== null) {
      await prisma.article.update({ where: { id: article.id }, data: { description } });
    }
  }

  return data.items.length;
}

export function startFeedJob(): void {
  const intervalMin = parseInt(process.env.FEED_FETCH_INTERVAL_MIN || "30", 10);

  // 起動時に1回即時実行
  fetchFeed()
    .then((count) => console.log(`[feedFetcher] Initial fetch: ${count} articles`))
    .catch((err) => console.error("[feedFetcher] Initial fetch failed:", err));

  // 定期実行
  setInterval(() => {
    fetchFeed()
      .then((count) => console.log(`[feedFetcher] Fetched ${count} articles`))
      .catch((err) => console.error("[feedFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
