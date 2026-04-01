import { prisma } from "../db.js";

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

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
  }

  const data: FeedResponse = await response.json();

  for (const item of data.items) {
    const imageUrl = item.image ? `${imageBaseUrl}/${item.image}` : "";
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
