import * as dotenv from "dotenv";
import { getToken } from "../auth/token.ts";
import { initAuth, refreshAccessToken } from "../auth/spotifyAuth.ts";

interface CurrentPlayingRes {
  id: string;
  images: string | null;
}

interface SpotifyError {
  error: {
    status: number;
    message: string;
  };
}

export const getCurrentTrackHelper =
  async (): Promise<CurrentPlayingRes | null> => {
    const MAX_RETRIES = 1;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const tokens = await getToken();

        if (!tokens.access_token || !tokens.refresh_token) {
          console.log("No valid tokens found, initiating auth flow...");
          await initAuth();
          const newTokens = await getToken();
          if (!newTokens.access_token) {
            throw new Error(
              "Failed to obtain access token after authentication"
            );
          }
        }

        const response = await fetch(
          "https://api.spotify.com/v1/me/player/currently-playing",
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          }
        );

        if (response.status === 401 && attempt < MAX_RETRIES) {
          console.log("Access token expired, refreshing...");
          await refreshAccessToken();
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
            const errorData: SpotifyError = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
          } catch {}
          throw new Error(`Spotify API error: ${errorMessage}`);
        }

        const data = await response.json();

        if (!data?.item?.id) {
          console.log("No valid track data in response");
          return null;
        }

        const track = data.item;

        return {
          id: track.id,
          images: track.album.images[0].url,
        };
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          console.error("Failed to get currently playing track:", error);
          return null;
        }
        console.warn(`Attempt ${attempt + 1} failed, retrying...`, error);
      }
    }

    return null;
  };

const getRecentlyPlayedTrack = async (): Promise<CurrentPlayingRes | null> => {
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const tokens = await getToken();

      if (!tokens.access_token || !tokens.refresh_token) {
        console.log("No valid tokens found, initiating auth flow...");
        await initAuth();
        const newTokens = await getToken();
        if (!newTokens.access_token) {
          throw new Error("Failed to obtain access token after authentication");
        }
      }

      const response = await fetch(
        "https://api.spotify.com/v1/me/player/recently-played?limit=1",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );

      if (response.status === 401 && attempt < MAX_RETRIES) {
        console.log("Access token expired, refreshing...");
        await refreshAccessToken();
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
          const errorData: SpotifyError = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch {}
        throw new Error(`Spotify API error: ${errorMessage}`);
      }

      const data = await response.json();

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

      return {
        id: recentTrack.id,
        images: recentTrack.album?.images?.[0]?.url || null,
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error("Failed to get recently played track:", error);
        return null;
      }
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, error);
    }
  }

  return null;
};

export const getTrackInfo = async (): Promise<CurrentPlayingRes | null> => {
  let result = await getCurrentTrackHelper();

  if (!result) {
    result = await getRecentlyPlayedTrack();
    if (!result) {
      console.error("No tracks found");
      return null;
    }
  }

  return result;
};
