import { getToken } from "../auth/spotifyAuth.js";
import * as dotenv from "dotenv";

dotenv.config();

const SP_DC = process.env.SP_DC;

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

function userAgent(): string {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
}

const getCurrentTrackHelper = async (): Promise<CurrentPlayingRes | null> => {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getToken();

      if (!accessToken) {
        throw new Error("Failed to obtain access token");
      }

      const response = await fetch(
        "https://api.spotify.com/v1/me/player/currently-playing",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": userAgent(),
            Origin: "https://open.spotify.com",
            Referer: "https://open.spotify.com/",
            Cookie: `sp_dc=${SP_DC}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.log("Access token expired, retrying with fresh token...");
        continue;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 204) {
        console.log("No track currently playing");
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
        console.log("No valid track data in response");
        return null;
      }

      const track = data.item;
      const imageUrl = track.album?.images?.[0]?.url || null;
      const track_uri = track.uri;
      const album_uri = track.album?.uri.split(":").pop();

      if (!imageUrl) {
        console.warn("No album image found for current track");
      }

      return {
        id: track.id,
        images: imageUrl,
        uri: track_uri,
        album_uri: album_uri,
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error("Failed to get currently playing track:", error);
        return null;
      }
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return null;
};

const getRecentlyPlayedTrack = async (): Promise<CurrentPlayingRes | null> => {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const accessToken = await getToken();

      if (!accessToken) {
        throw new Error("Failed to obtain access token");
      }

      const response = await fetch(
        "https://api.spotify.com/v1/me/player/recently-played?limit=1",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": userAgent(),
            Origin: "https://open.spotify.com",
            Referer: "https://open.spotify.com/",
            Cookie: `sp_dc=${SP_DC}`,
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.log("Access token expired, retrying with fresh token...");
        continue;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
        console.log(`Rate limited, waiting ${waitTime}ms...`);
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
        console.log("No recently played tracks found");
        return null;
      }

      const recentTrack = data.items[0]?.track;

      if (!recentTrack?.id) {
        console.log("Invalid track data in recently played response");
        return null;
      }

      const imageUrl = recentTrack.album?.images?.[0]?.url || null;
      const track_uri = recentTrack.uri;
      if (!imageUrl) {
        console.warn("No album image found for recent track");
      }

      return {
        id: recentTrack.id,
        images: imageUrl,
        uri: track_uri,
        album_uri: recentTrack.album?.uri.split(":").pop(),
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error("Failed to get recently played track:", error);
        return null;
      }
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return null;
};

export const getTrackInfo = async (): Promise<CurrentPlayingRes | null> => {
  console.log("Getting current track info...");

  let result = await getCurrentTrackHelper();

  if (!result) {
    console.log("No current track, falling back to recently played...");
    result = await getRecentlyPlayedTrack();

    if (!result) {
      console.error("No tracks found in current or recently played");
      return null;
    }

    console.log("Found recently played track");
  } else {
    console.log("Found currently playing track");
  }

  return result;
};
