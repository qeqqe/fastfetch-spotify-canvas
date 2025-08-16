import * as keytar from "keytar";
import { initAuth, type TokenData } from "./spotifyAuth.ts";

export const setToken = async (token: TokenData) => {
  try {
    await keytar.setPassword(
      "fastfetch-spotify-canvas",
      "access_token",
      token.access_token
    );
    await keytar.setPassword(
      "fastfetch-spotify-canvas",
      "refresh_token",
      token.refresh_token
    );
    await keytar.setPassword(
      "fastfetch-spotify-canvas",
      "expires_at",
      token.expires_at.toString()
    );
  } catch (error) {
    console.error(`Error occoured while setting tokens: ${error}`);
  }
};

export const getToken = async (): Promise<TokenData> => {
  try {
    let [access_token, refresh_token, expires_at] = await Promise.all([
      keytar.getPassword("fastfetch-spotify-canvas", "access_token"),
      keytar.getPassword("fastfetch-spotify-canvas", "refresh_token"),
      keytar.getPassword("fastfetch-spotify-canvas", "expires_at"),
    ]);

    if (!access_token || !refresh_token) {
      await initAuth();

      [access_token, refresh_token, expires_at] = await Promise.all([
        keytar.getPassword("fastfetch-spotify-canvas", "access_token"),
        keytar.getPassword("fastfetch-spotify-canvas", "refresh_token"),
        keytar.getPassword("fastfetch-spotify-canvas", "expires_at"),
      ]);

      if (!access_token || !refresh_token) {
        throw new Error("Tokens are missing even after re-authentication.");
      }
    }
    if (!expires_at) {
      throw new Error("expires_at is missing.");
    }

    return { access_token, refresh_token, expires_at: Number(expires_at) };
  } catch (error) {
    console.error(`Error occurred while fetching tokens: ${error}`);
    throw error;
  }
};
