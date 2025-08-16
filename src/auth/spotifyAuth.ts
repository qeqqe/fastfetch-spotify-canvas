import * as dotenv from "dotenv";
import * as http from "http";
import { spawn } from "child_process";
import { getToken, setToken } from "./token.ts";
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REDIRECT_URI = process.env.CALLBACK_URL!;
const PORT = process.env.PORT!;
const SCOPES = "streaming user-read-currently-playing user-read-playback-state";

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export const initAuth = async () => {
  console.log("Starting Spotify authentication...");
  const authUrl =
    `https://accounts.spotify.com/authorize?` +
    `client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  console.log("Opening browser for authentication...");
  openBrowser(authUrl);

  const authCode = await startCallbackServer();
  const tokens = await exchangeCodeForTokens(authCode);

  setToken(tokens);
};

export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const tokens = await getToken();
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      console.log("No refresh token found. Please re-authenticate.");
      return null;
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${CLIENT_ID}:${CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.log("Failed to refresh token. Please re-authenticate.");
      return null;
    }

    const data = await response.json();

    await setToken({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // spotify might not return new refresh token
      expires_at: Date.now() + data.expires_in * 1000,
    });

    console.log("✅ Token refreshed successfully");
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
};
export const getValidToken = async (): Promise<string | null> => {
  try {
    const tokenData = await getToken();

    if (!tokenData.access_token || !tokenData.expires_at) {
      return null;
    }

    const now = Date.now();
    const expiry = tokenData.expires_at;

    if (now < expiry - 5 * 60 * 1000) {
      return tokenData.access_token;
    }

    return await refreshAccessToken();
  } catch (error) {
    console.error("Error getting token:", error);
    return null;
  }
};

const startCallbackServer = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url!, REDIRECT_URI);
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`Authentication error: ${error}`));
          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to your terminal.</p>
                <script>setTimeout(() => window.close(), 2000);</script>
              </body>
            </html>
          `);
            server.close();
            resolve(code);
          }
        }
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(8888, "localhost", () => {
      console.log(`🌐 Callback server started on ${REDIRECT_URI}`);
    });

    server.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Authentication timeout"));
    }, 120000);
  });
};

const exchangeCodeForTokens = async (code: string): Promise<TokenData> => {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${CLIENT_ID}:${CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
};

const openBrowser = (url: string): void => {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case "darwin":
      command = "open";
      break;
    case "win32":
      command = "start";
      break;
    default:
      command = "xdg-open";
  }

  spawn(command, [url], { detached: true, stdio: "ignore" });
};
