import * as OTPAuth from "otpauth";
import * as dotenv from "dotenv";

dotenv.config();

const SP_DC = process.env.SP_DC;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;

// token caching
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;
const SECRETS_URL =
  "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json";

let currentTotp: OTPAuth.TOTP | null = null;
let currentTotpVersion: string | null = null;
let lastFetchTime = 0;
const FETCH_INTERVAL = 60 * 60 * 1000; 

let updatePromise: Promise<void> | null = null;

interface SecretsDict {
  [version: string]: number[];
}

interface ServerTimeResponse {
  serverTime: string;
}

interface TokenResponse {
  accessToken?: string;
}

interface AuthPayload {
  reason: string;
  productType: string;
  totp: string;
  totpVer: string;
  totpServer: string;
}

function userAgent(): string {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
}

function createTotpSecret(data: number[]): OTPAuth.Secret {
  const mappedData = data.map((value, index) => value ^ ((index % 33) + 9));
  const hexData = Buffer.from(mappedData.join(""), "utf8").toString("hex");
  return OTPAuth.Secret.fromHex(hexData);
}

async function fetchSecretsFromGitHub(): Promise<SecretsDict> {
  try {
    const response = await fetch(SECRETS_URL, {
      method: "GET",
      headers: {
        "User-Agent": userAgent(),
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const secrets = (await response.json()) as SecretsDict;
    return secrets;
  } catch (error) {
    throw error;
  }
}

function findNewestVersion(secrets: SecretsDict): string {
  const versions = Object.keys(secrets).map(Number);
  return Math.max(...versions).toString();
}

function useFallbackSecret(): void {
  // This secret will most likely fail because Spotify rotates secrets every couple of days
  // v61 
  const fallbackData = [
    44, 55, 47, 42, 70, 40, 34, 114, 76, 74, 50, 111, 120, 97, 75, 76, 94, 102, 43, 69, 49, 120, 118, 80, 64, 78 
  ];
  const totpSecret = createTotpSecret(fallbackData);

  currentTotp = new OTPAuth.TOTP({
    period: 30,
    digits: 6,
    algorithm: "SHA1",
    secret: totpSecret,
  });

  currentTotpVersion = "19";
}

async function updateTotpSecrets(): Promise<void> {
  if (updatePromise) {
    return updatePromise;
  }

  updatePromise = (async () => {
    try {
      const now = Date.now();
      if (now - lastFetchTime < FETCH_INTERVAL) {
        return;
      }

      const secrets = await fetchSecretsFromGitHub();
      const newestVersion = findNewestVersion(secrets);

      if (newestVersion && newestVersion !== currentTotpVersion) {
        const secretData = secrets[newestVersion];
        if (!secretData || !Array.isArray(secretData)) {
          throw new Error(`Invalid secret data for version ${newestVersion}`);
        }

        const totpSecret = createTotpSecret(secretData);

        currentTotp = new OTPAuth.TOTP({
          period: 30,
          digits: 6,
          algorithm: "SHA1",
          secret: totpSecret,
        });

        currentTotpVersion = newestVersion;
        lastFetchTime = now;
      } else {
        lastFetchTime = now;
      }
    } catch (error) {
      if (!currentTotp) {
        useFallbackSecret();
      }
    } finally {
      updatePromise = null;
    }
  })();

  return updatePromise;
}

async function initializeTotpSecrets(): Promise<void> {
  try {
    await updateTotpSecrets();
  } catch (error) {
    useFallbackSecret();
  }
}

function generateTOTP(timestamp: number): string {
  if (!currentTotp) {
    throw new Error("TOTP not initialized");
  }
  return currentTotp.generate({ timestamp });
}

async function getServerTime(): Promise<number> {
  try {
    const response = await fetch("https://open.spotify.com/api/server-time", {
      method: "GET",
      headers: {
        "User-Agent": userAgent(),
        Origin: "https://open.spotify.com/",
        Referer: "https://open.spotify.com/",
        Cookie: `sp_dc=${SP_DC}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ServerTimeResponse;
    const time = Number(data.serverTime);

    if (isNaN(time) || time <= 0) {
      throw new Error("Invalid server time");
    }

    return time * 1000;
  } catch (error) {
    return Date.now();
  }
}

async function generateAuthPayload(
  reason: string,
  productType: string
): Promise<AuthPayload> {
  const localTime = Date.now();
  const serverTime = await getServerTime();

  return {
    reason,
    productType,
    totp: generateTOTP(localTime),
    totpVer: currentTotpVersion || "19",
    totpServer: generateTOTP(Math.floor(serverTime / 30)),
  };
}

// get OAuth access token using refresh token flow with caching
// tokens are cached for 1 hour (expires_in - 60 seconds for safety)
export async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error(
      "Missing Spotify OAuth credentials. Please set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN in .env"
    );
  }

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000;

    return cachedAccessToken;
  } catch (error) {
    console.error("Failed to get OAuth access token:", error);
    throw error;
  }
}

export async function getToken(
  reason = "init",
  productType = "mobile-web-player"
): Promise<string | undefined> {
  if (!currentTotp) {
    await initializeTotpSecrets();
  }

  if (Date.now() - lastFetchTime >= FETCH_INTERVAL) {
    try {
      await updateTotpSecrets();
    } catch (error) {
      console.warn(
        "Failed to update TOTP secrets, continuing with current version:",
        error
      );
    }
  }

  const payload = await generateAuthPayload(reason, productType);

  const url = new URL("https://open.spotify.com/api/token");
  Object.entries(payload).forEach(([key, value]) =>
    url.searchParams.append(key, value)
  );

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": userAgent(),
        Origin: "https://open.spotify.com/",
        Referer: "https://open.spotify.com/",
        Cookie: `sp_dc=${SP_DC}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as TokenResponse;
    return data.accessToken;
  } catch (error) {
    console.error("Failed to get token:", error);
    throw error;
  }
}
