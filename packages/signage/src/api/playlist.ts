export type PlaylistItemType =
  | "ARTICLE_LATEST"
  | "ARTICLE_RANDOM"
  | "RANKING"
  | "IMAGE"
  | "VIDEO";

export interface MediaPayload {
  mediaFileId: string;
  url: string;
  mimeType: string;
  isFullscreen: boolean;
}

export type PlaylistItem =
  | {
      id: string;
      type: "ARTICLE_LATEST";
      order: number;
      durationSec: number | null;
      payload: null;
    }
  | {
      id: string;
      type: "ARTICLE_RANDOM";
      order: number;
      durationSec: number | null;
      payload: null;
    }
  | {
      id: string;
      type: "RANKING";
      order: number;
      durationSec: number | null;
      payload: null;
    }
  | {
      id: string;
      type: "IMAGE";
      order: number;
      durationSec: number | null;
      payload: MediaPayload | null;
    }
  | {
      id: string;
      type: "VIDEO";
      order: number;
      durationSec: number | null;
      payload: MediaPayload | null;
    };

export interface PlaylistResponse {
  items: PlaylistItem[];
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080/api";

export async function fetchPlaylist(): Promise<PlaylistResponse> {
  const res = await fetch(`${API_BASE_URL}/signage/playlist`);
  if (!res.ok) {
    throw new Error(`Failed to fetch playlist: ${res.status}`);
  }
  return res.json() as Promise<PlaylistResponse>;
}
