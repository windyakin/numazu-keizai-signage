export type PlaylistItemType =
  | "ARTICLE_LATEST"
  | "ARTICLE_RANDOM"
  | "RANKING"
  | "WEATHER"
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
      type: "WEATHER";
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
  id: string;
  items: PlaylistItem[];
}

export interface PlaybackReport {
  playlistId: string;
  currentItemId: string;
  looped: boolean;
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

export async function reportPlayback(payload: PlaybackReport): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/signage/playback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // edge unavailable: drop the report, signage rendering must continue
  }
}
