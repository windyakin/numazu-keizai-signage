export interface RankingItem {
  id: string;
  title: string;
  imageUrl: string;
  rank: number;
  start: string;
}

export interface RankingsData {
  rankings: RankingItem[];
  fetchedAt: string | null;
}

interface RankingsResponse {
  rankings: RankingItem[];
  fetchedAt: string | null;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080/api";

export async function fetchRankings(): Promise<RankingsData> {
  const res = await fetch(`${API_BASE_URL}/signage/rankings`);
  if (!res.ok) {
    throw new Error(`Failed to fetch rankings: ${res.status}`);
  }
  const data: RankingsResponse = await res.json();
  return { rankings: data.rankings, fetchedAt: data.fetchedAt };
}
