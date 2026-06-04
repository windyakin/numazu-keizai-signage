import { XMLParser } from "fast-xml-parser";
import { prisma } from "../db.js";

// 気象庁 防災情報XML（https://xml.kishou.go.jp/）から天気予報を取得する。
//
// - 今日/明日/明後日: 府県天気予報 (VPFD)。予報区域（class10）単位で天気・降水確率・気温を持つ。
// - 週間: 府県週間天気予報 (VPFW)。府県単位で 7 日分の天気・降水確率・気温を持つ。
//   初日(refID=1)は気温・降水確率が「値なし」で、VPFD と重複するため VPFD を優先する。
//
// regular.xml(Atom) をポーリングして最新の VPFD/VPFW ドキュメント URL を解決し、
// 2 文書をパースして JST 日付ごとにマージする。天気コードは「天気予報用テロップ番号」
// (1xx 晴 / 2xx 曇 / 3xx 雨 / 4xx 雪)。

// 長期フィードを使う。短期(regular.xml)は直近約10時間ぶんしか保持せず、
// 1 日 2 回しか出ない府県週間天気予報(VPFW)が早朝などに流れて消えてしまうため。
// 長期フィードは直近約 7 日ぶん（gzip 転送で ~190KB）。
const DEFAULT_FEED_URL =
  "https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml";
const DEFAULT_PREF_CODE = "220000"; // 静岡県
const DEFAULT_AREA_CODE = "220030"; // 静岡県東部（沼津を含む）
const DEFAULT_TEMP_POINT = "50206"; // 三島（VPFD の気温地点。沼津に最も近い）
const DEFAULT_USER_AGENT = "numazu-keizai-signage/1.0";

// アメダス現在気温。観測所番号は気温地点(WEATHER_JMA_TEMP_POINT)と共通（三島=50206）。
const AMEDAS_LATEST_TIME_URL =
  "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt";
const AMEDAS_MAP_BASE = "https://www.jma.go.jp/bosai/amedas/data/map";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: true,
  trimValues: true,
});

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "YYYY-MM-DD" 同士の日数差（a - b）
function dateStrDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((v) => parseInt(v, 10));
  const [by, bm, bd] = b.split("-").map((v) => parseInt(v, 10));
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

interface PartialDay {
  weatherCode?: number;
  description?: string;
  tempMin?: number;
  tempMax?: number;
  pop?: number; // %（0..100）
}

// アメダスの観測所番号の現在気温（℃）を取得する。失敗しても致命的ではない（null を返す）。
async function fetchCurrentTemp(stationNo: string): Promise<number | null> {
  try {
    const latest = (await fetchText(AMEDAS_LATEST_TIME_URL)).trim();
    // "2026-06-01T23:40:00+09:00" → "20260601234000"
    const ts = latest.replace(/[-:T]/g, "").replace(/\+\d{4}$/, "");
    const mapUrl = `${AMEDAS_MAP_BASE}/${ts}.json`;
    const map = JSON.parse(await fetchText(mapUrl)) as Record<
      string,
      { temp?: [number, number] }
    >;
    const t = map[stationNo]?.temp?.[0];
    return num(t);
  } catch (e) {
    console.error("[weatherFetcher] amedas current temp fetch failed:", e);
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  const ua = process.env.WEATHER_JMA_USER_AGENT || DEFAULT_USER_AGENT;
  const res = await fetch(url, { headers: { "User-Agent": ua } });
  if (!res.ok) {
    throw new Error(`JMA fetch failed: ${res.status} ${res.statusText} ${url}`);
  }
  return res.text();
}

// regular.xml から、href に府県コードを含む最新の VPFD / VPFW ドキュメント URL を解決する。
function resolveDocUrls(
  feedXml: string,
  prefCode: string,
): { vpfd: string | null; vpfw: string | null } {
  const feed = parser.parse(feedXml);
  const entries = toArray<any>(feed?.feed?.entry);

  let vpfd: { url: string; updated: string } | null = null;
  let vpfw: { url: string; updated: string } | null = null;

  for (const e of entries) {
    const title = String(e?.title ?? "");
    const updated = String(e?.updated ?? "");
    // link は単一/配列どちらもありうる
    const links = toArray<any>(e?.link);
    const href = links.map((l) => String(l?.["@_href"] ?? "")).find((h) => h);
    if (!href || !href.includes(`_${prefCode}.xml`)) continue;

    if (title.startsWith("府県週間天気予報")) {
      if (!vpfw || updated > vpfw.updated) vpfw = { url: href, updated };
    } else if (title.startsWith("府県天気予報")) {
      // "府県天気概況" を除外（startsWith では弾けるが念のため）
      if (title.includes("概況")) continue;
      if (!vpfd || updated > vpfd.updated) vpfd = { url: href, updated };
    }
  }

  return { vpfd: vpfd?.url ?? null, vpfw: vpfw?.url ?? null };
}

// TimeSeriesInfo の refID → JST 日付（"YYYY-MM-DD"）。
// JMA の DateTime は +09:00 固定なので先頭 10 文字がそのまま JST 日付になる。
function timeDefMap(tsi: any): Record<string, string> {
  const m: Record<string, string> = {};
  for (const td of toArray<any>(tsi?.TimeDefines?.TimeDefine)) {
    const id = String(td?.["@_timeId"] ?? "");
    const dt = String(td?.DateTime ?? "");
    if (id && dt.length >= 10) m[id] = dt.slice(0, 10);
  }
  return m;
}

function* eachTimeSeries(body: any): Generator<any> {
  for (const mi of toArray<any>(body?.MeteorologicalInfos)) {
    for (const tsi of toArray<any>(mi?.TimeSeriesInfo)) yield tsi;
  }
}

// Item > Kind > Property。Kind は単一(複数 Property を内包)の場合と、
// Property を 1 つずつ持つ Kind が複数並ぶ場合（区域予報の 天気/風/波 など）の両方がある。
function properties(item: any): any[] {
  return toArray<any>(item?.Kind).flatMap((k) => toArray<any>(k?.Property));
}

function ensure(days: Map<string, PartialDay>, date: string): PartialDay {
  let d = days.get(date);
  if (!d) {
    d = {};
    days.set(date, d);
  }
  return d;
}

// 1 ドキュメント（VPFD / VPFW）から区域/府県の天気・降水確率・気温を抽出する。
// overwrite=true なら既存値を上書き（VPFD 用）、false なら未設定のみ補完（VPFW 用）。
function extractDocument(
  xml: string,
  opts: { areaCodes: Set<string>; tempPoint: string; overwrite: boolean },
  days: Map<string, PartialDay>,
): void {
  const body = parser.parse(xml)?.Report?.Body;
  if (!body) return;

  const set = (d: PartialDay, key: keyof PartialDay, v: number | string) => {
    if (opts.overwrite || d[key] == null) (d as any)[key] = v;
  };

  // --- 天気（テロップ番号）・天気文 / 降水確率 ---
  for (const tsi of eachTimeSeries(body)) {
    const td = timeDefMap(tsi);
    for (const item of toArray<any>(tsi?.Item)) {
      const areaCode = String(item?.Area?.Code ?? "");
      if (!opts.areaCodes.has(areaCode)) continue;
      for (const prop of properties(item)) {
        const type = String(prop?.Type ?? "");
        if (type === "天気") {
          for (const wc of toArray<any>(prop?.WeatherCodePart?.WeatherCode)) {
            const date = td[String(wc?.["@_refID"] ?? "")];
            const code = num(wc?.["#text"]);
            if (date && code != null) set(ensure(days, date), "weatherCode", code);
          }
          for (const w of toArray<any>(prop?.WeatherPart?.Weather)) {
            const date = td[String(w?.["@_refID"] ?? "")];
            const text = w?.["#text"];
            if (date && text != null) set(ensure(days, date), "description", String(text));
          }
        } else if (type === "降水確率") {
          const pops: Record<string, number> = {};
          for (const pp of toArray<any>(
            prop?.ProbabilityOfPrecipitationPart?.ProbabilityOfPrecipitation,
          )) {
            const date = td[String(pp?.["@_refID"] ?? "")];
            const v = num(pp?.["#text"]);
            if (date && v != null) pops[date] = Math.max(pops[date] ?? 0, v);
          }
          for (const [date, v] of Object.entries(pops)) {
            set(ensure(days, date), "pop", v);
          }
        }
      }
    }
  }

  // --- 気温（地点予報）---
  // tempPoint があればそれを、無ければ最初に見つかった地点を採用する。
  const tempItems: { item: any; td: Record<string, string>; station: string }[] = [];
  for (const tsi of eachTimeSeries(body)) {
    const td = timeDefMap(tsi);
    for (const item of toArray<any>(tsi?.Item)) {
      const station = String(item?.Station?.Code ?? "");
      if (!station) continue;
      const hasTemp = properties(item).some((p) => {
        const t = String(p?.Type ?? "");
        return t.endsWith("最低気温") || t.endsWith("最高気温");
      });
      if (hasTemp) tempItems.push({ item, td, station });
    }
  }
  if (tempItems.length > 0) {
    const stations = tempItems.map((x) => x.station);
    const chosen = stations.includes(opts.tempPoint) ? opts.tempPoint : stations[0];
    for (const { item, td, station } of tempItems) {
      if (station !== chosen) continue;
      for (const prop of properties(item)) {
        const type = String(prop?.Type ?? "");
        const isMin = type.endsWith("最低気温");
        const isMax = type.endsWith("最高気温");
        if (!isMin && !isMax) continue;
        for (const t of toArray<any>(prop?.TemperaturePart?.Temperature)) {
          const date = td[String(t?.["@_refID"] ?? "")];
          const v = num(t?.["#text"]);
          if (!date || v == null) continue;
          set(ensure(days, date), isMin ? "tempMin" : "tempMax", v);
        }
      }
    }
  }
}

export async function fetchWeather(): Promise<number> {
  const feedUrl = process.env.WEATHER_JMA_FEED_URL || DEFAULT_FEED_URL;
  const prefCode = process.env.WEATHER_JMA_PREF_CODE || DEFAULT_PREF_CODE;
  const areaCode = process.env.WEATHER_JMA_AREA_CODE || DEFAULT_AREA_CODE;
  const tempPoint = process.env.WEATHER_JMA_TEMP_POINT || DEFAULT_TEMP_POINT;

  const feedXml = await fetchText(feedUrl);
  const { vpfd, vpfw } = resolveDocUrls(feedXml, prefCode);
  if (!vpfd && !vpfw) {
    throw new Error(`No forecast document found for pref ${prefCode} in feed`);
  }

  const days = new Map<string, PartialDay>();
  // VPFD（区域 220030）を先に上書きで入れ、VPFW（府県 220000）で未設定分を補完する。
  const areaCodes = new Set([areaCode, prefCode]);
  if (vpfd) {
    const xml = await fetchText(vpfd);
    extractDocument(xml, { areaCodes, tempPoint, overwrite: true }, days);
  }
  if (vpfw) {
    const xml = await fetchText(vpfw);
    extractDocument(xml, { areaCodes, tempPoint, overwrite: false }, days);
  }

  // 天気コードが取れた日付のみを採用（必須項目）。今日 = 最小日付。
  const dates = [...days.keys()]
    .filter((d) => days.get(d)?.weatherCode != null)
    .sort();
  if (dates.length === 0) {
    throw new Error("No weather days extracted from JMA documents");
  }
  const todayStr = dates[0];

  // 今日の現在気温（アメダス）。予報の最高/最低が無いときの表示用。
  const currentTemp = await fetchCurrentTemp(tempPoint);

  // 既存の予報を全削除して入れ替え（rankings と同じ総入れ替え方式）
  await prisma.weatherForecast.deleteMany();

  let count = 0;
  for (const date of dates) {
    const d = days.get(date)!;
    await prisma.weatherForecast.create({
      data: {
        date,
        dayOffset: dateStrDiff(date, todayStr),
        weatherCode: d.weatherCode!,
        description: d.description ?? "",
        tempMin: d.tempMin ?? null,
        tempMax: d.tempMax ?? null,
        tempCurrent: date === todayStr ? currentTemp : null,
        pop: (d.pop ?? 0) / 100, // % → 0..1
      },
    });
    count++;
  }

  return count;
}

export function startWeatherJob(): void {
  const intervalMin = parseInt(process.env.WEATHER_FETCH_INTERVAL_MIN || "30", 10);

  // 起動時に1回即時実行
  fetchWeather()
    .then((count) => console.log(`[weatherFetcher] Initial fetch: ${count} days`))
    .catch((err) => console.error("[weatherFetcher] Initial fetch failed:", err));

  // 定期実行
  setInterval(() => {
    fetchWeather()
      .then((count) => console.log(`[weatherFetcher] Fetched ${count} days`))
      .catch((err) => console.error("[weatherFetcher] Fetch failed:", err));
  }, intervalMin * 60 * 1000);
}
