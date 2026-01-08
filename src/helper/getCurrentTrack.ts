import { getAccessToken } from "../auth/spotifyAuth.js";
import * as dotenv from "dotenv";

dotenv.config();

export interface CurrentPlayingRes {
  id: string;
  images: string;
  uri: string;
  album_uri: string;
}

interface SpotifyInternalError {
  error?: {
    status?: number;
    message?: string;
  };
}

const getCurrentTrackHelper = async (): Promise<CurrentPlayingRes | null> => {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(
        "https://api.spotify.com/v1/me/player/currently-playing",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.status === 401 && attempt < MAX_RETRIES) {
        continue;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = (await response.json()) as SpotifyInternalError;
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          // no
        }
        throw new Error(`Spotify API error: ${errorMessage}`);
      }

      const data = (await response.json()) as { item?: any };

      if (!data?.item?.id) {
        return null;
      }

      const track = data.item;
      const imageUrl = track.album?.images?.[0]?.url || null;
      const track_uri = track.uri;
      const album_uri = track.album?.uri.split(":").pop();

      return {
        id: track.id,
        images: imageUrl,
        uri: track_uri,
        album_uri: album_uri,
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return null;
};

const getRecentlyPlayedTrack = async (): Promise<CurrentPlayingRes | null> => {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getAccessToken();

      const response = await fetch(
        "https://api.spotify.com/v1/me/player/recently-played?limit=1",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.status === 401 && attempt < MAX_RETRIES) {
        continue;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = (await response.json()) as SpotifyInternalError;
          errorMessage = errorData.error?.message || errorMessage;
        } catch {}
        throw new Error(`Spotify API error: ${errorMessage}`);
      }

      const data = (await response.json()) as { items?: any[] };

      if (
        !data?.items ||
        !Array.isArray(data.items) ||
        data.items.length === 0
      ) {
        return null;
      }

      const recentTrack = data.items[0]?.track;

      if (!recentTrack?.id) {
        return null;
      }

      const imageUrl = recentTrack.album?.images?.[0]?.url || null;
      const track_uri = recentTrack.uri;

      return {
        id: recentTrack.id,
        images: imageUrl,
        uri: track_uri,
        album_uri: recentTrack.album?.uri.split(":").pop(),
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return null;
};

export const getTrackInfo = async (): Promise<CurrentPlayingRes | null> => {
  let result = await getCurrentTrackHelper();

  if (!result) {
    result = await getRecentlyPlayedTrack();
    if (!result) {
      return null;
    }
    console.log("Got track (recently played)");
  } else {
    console.log("Got track (currently playing)");
  }

  return result;
};
