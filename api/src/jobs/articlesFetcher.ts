import { parse } from "node-html-parser";
import { prisma } from "../db.js";
import { cacheArticleImage } from "./articleImage.js";

interface RssArticle {
  id: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: Date;
}

/**
 * RSS XML をパースして記事一覧を返す。
 * node-html-parser は <link> を void 要素として扱うため、regex で抽出する。
 */
function parseRss(xml: string): RssArticle[] {
  const articles: RssArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const desc = block.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.trim() ?? null;
    const pubDateStr = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";

    const idMatch = link.match(/\/headline\/(\d+)\/?/);
    if (!idMatch) continue;

    articles.push({
      id: idMatch[1],
      title,
      description: desc?.replace(/\s*#沼津経済新聞\s*$/, "") ?? null,
      link: link.replace(/^http:/, "https:"),
      pubDate: new Date(pubDateStr),
    });
  }
  return articles;
}

/**
 * 記事ページから og:image の URL を返す。取得失敗時は null。
 */
export async function fetchArticleOgImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl);
    if (!res.ok) return null;
    const root = parse(await res.text());
    return root.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;
  } catch {
    return null;
  }
}

/**
 * 記事ページからメタ情報をまとめて取得する。ランキング経由の新規記事作成にも使う。
 */
export async function fetchArticlePageMeta(articleUrl: string): Promise<{
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  start: Date | null;
}> {
  try {
    const res = await fetch(articleUrl);
    if (!res.ok) return { title: null, description: null, imageUrl: null, start: null };
    const root = parse(await res.text());

    const title = root.querySelector("h1:not(.logo h1)")?.text?.trim() ?? null;
    const description =
      root.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;
    const imageUrl =
      root.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

    let start: Date | null = null;
    const timeText = root.querySelector("time")?.text?.trim();
    if (timeText) {
      const d = new Date(timeText.replace(/\./g, "-"));
      if (!isNaN(d.getTime())) start = d;
    }

    return { title, description, imageUrl, start };
  } catch {
    return { title: null, description: null, imageUrl: null, start: null };
  }
}

export async function fetchArticles(): Promise<number> {
  const feedUrl = process.env.FEED_URL;
  if (!feedUrl) {
    throw new Error("FEED_URL is not set");
  }

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`Articles fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const articles = parseRss(xml);

  for (const article of articles) {
    // 既存記事で画像取得済みなら記事ページへの fetch をスキップ
    const existing = await prisma.article.findUnique({
      where: { id: article.id },
      select: { mediaFileId: true },
    });

    let mediaFileId = existing?.mediaFileId ?? null;
    if (!mediaFileId) {
      const imageUrl = await fetchArticleOgImage(article.link);
      if (imageUrl) {
        mediaFileId = await cacheArticleImage(article.id, imageUrl);
      }
    }

    await prisma.article.upsert({
      where: { id: article.id },
      update: {
        title: article.title,
        mediaFileId,
        start: article.pubDate,
        description: article.description,
        fetchedAt: new Date(),
      },
      create: {
        id: article.id,
        title: article.title,
        mediaFileId,
        start: article.pubDate,
        description: article.description,
        fetchedAt: new Date(),
      },
    });
  }

  return articles.length;
}

export function startArticlesJob(): void {
  const intervalMin = parseInt(process.env.FEED_FETCH_INTERVAL_MIN || "30", 10);

  fetchArticles()
    .then((count) => console.log(`[articlesFetcher] Initial fetch: ${count} articles`))
    .catch((err) => console.error("[articlesFetcher] Initial fetch failed:", err));

  setInterval(() => {
    fetchArticles()
      .then((count) => console.log(`[articlesFetcher] Fetched ${count} articles`))
      .catch((err) => console.error("[articlesFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
