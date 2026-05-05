import { prisma } from "../db.js";

interface AccessItem {
  id: string;
  title: string;
  image: string;
  photo: string;
  start: string;
  rank: string;
  categories: { id: string; name: string; name_jp: string }[];
}

interface AccessResponse {
  items: AccessItem[];
  cp: {
    category: string;
    limit: number;
    from: number;
    next: string;
  };
}

export async function fetchAccessRanking(): Promise<number> {
  const accessUrl = process.env.ACCESS_URL;
  const imageBaseUrl = process.env.FEED_IMAGE_BASE_URL;

  if (!accessUrl) {
    throw new Error("ACCESS_URL is not set");
  }
  if (!imageBaseUrl) {
    throw new Error("FEED_IMAGE_BASE_URL is not set");
  }

  const response = await fetch(accessUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: "mode=async&category=access&limit=15&from=1",
  });
  if (!response.ok) {
    throw new Error(`Access ranking fetch failed: ${response.status} ${response.statusText}`);
  }

  const data: AccessResponse = await response.json();

  // 既存のランキングを全削除して入れ替え
  await prisma.accessRanking.deleteMany();

  for (const item of data.items) {
    const imageUrl = item.image
      ? `${imageBaseUrl.replace(/\/+$/, "")}/${item.image.replace(/^\/+/, "")}`
      : "";
    const start = new Date(item.start.replace(" ", "T") + "+09:00");

    await prisma.accessRanking.create({
      data: {
        id: item.id,
        title: item.title,
        imageUrl,
        rank: parseInt(item.rank, 10),
        start,
        fetchedAt: new Date(),
      },
    });
  }

  return data.items.length;
}

export function startAccessJob(): void {
  const intervalMin = parseInt(process.env.FEED_FETCH_INTERVAL_MIN || "30", 10);

  // 起動時に1回即時実行
  fetchAccessRanking()
    .then((count) => console.log(`[accessFetcher] Initial fetch: ${count} rankings`))
    .catch((err) => console.error("[accessFetcher] Initial fetch failed:", err));

  // 定期実行
  setInterval(() => {
    fetchAccessRanking()
      .then((count) => console.log(`[accessFetcher] Fetched ${count} rankings`))
      .catch((err) => console.error("[accessFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
