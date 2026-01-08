import { getToken } from "../auth/spotifyAuth.js";
import { CurrentPlayingRes, getTrackInfo } from "../helper/getCurrentTrack.js";
import * as canvas from "../proto/_canvas.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
interface Track {
  setTrackUri(uri: string): void;
}

interface CanvasRequest {
  addTracks(track: Track): void;
  serializeBinary(): Uint8Array;
}

interface CanvasResponse {
  deserializeBinary(data: Uint8Array): CanvasResponse;
  toObject(): any;
}

interface Canvases {
  data: Data;
}

interface Data {
  canvasesList: CanvasesList[];
}

interface CanvasesList {
  id: string;
  canvasUrl: string;
  trackUri: string;
  otherId: string;
  canvasUri: string;
}

interface CanvasRequestConstructor {
  new (): CanvasRequest;
  Track: new () => Track;
}

interface CanvasResponseConstructor {
  new (): CanvasResponse;
  deserializeBinary(data: Uint8Array): CanvasResponse;
}

interface ProtoModule {
  CanvasRequest: CanvasRequestConstructor;
  CanvasResponse: CanvasResponseConstructor;
}

export async function getCanvases(): Promise<any | null> {
  try {
    const CanvasRequest = canvas.CanvasRequest;
    const CanvasResponse = canvas.CanvasResponse;

    const accessToken = await getToken();
    if (!accessToken) {
      console.error("Failed to obtain Canvas API token");
      return null;
    }

    const track_info: CurrentPlayingRes | null = await getTrackInfo();
    if (!track_info) {
      return null;
    }

    if (await alreadyExists(track_info.album_uri)) {
      console.log("Canvas already exists for this album");
      process.exit(0);
    }
    const canvasRequest = new CanvasRequest();
    const track = new CanvasRequest.Track();
    if (!track_info?.uri) {
      return null;
    }
    track.track_uri = track_info.uri;
    const tracks = canvasRequest.tracks || [];
    tracks.push(track);
    canvasRequest.tracks = tracks;

    const requestBytes = canvasRequest.serializeBinary();

    const response = await fetch(
      "https://spclient.wg.spotify.com/canvaz-cache/v0/canvases",
      {
        method: "POST",
        body: Buffer.from(requestBytes),
        headers: {
          Accept: "application/protobuf",
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept-Language": "en",
          "User-Agent": "Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)",
          "Accept-Encoding": "gzip, deflate, br",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return null;
    }

    const responseData = await response.arrayBuffer();
    const responseBytes = new Uint8Array(responseData);

    const canvasResponse = CanvasResponse.deserializeBinary(responseBytes);
    if (canvasResponse?.canvases?.[0]?.canvas_url) {
      console.log("Got canvas for track");
      await downloadMedia(
        canvasResponse.canvases[0].canvas_url,
        "canvas",
        track_info.album_uri
      );
    } else {
      console.log("No canvas available, using album cover");
      await downloadMedia(track_info.images, "image", track_info.album_uri);
    }
    return canvasResponse.toObject();
  } catch (error) {
    console.error("Failed to get canvas:", error);
    return null;
  }
}

async function alreadyExists(album_uri: string): Promise<boolean> {
  const outputDir = path.join(os.homedir(), "images", "fastfetch", "media");
  try {
    const files = await fs.readdir(outputDir);
    return files.some((file: string) => path.parse(file).name === album_uri);
  } catch {
    return false;
  }
}
async function downloadMedia(
  url: string,
  mediaType: "canvas" | "image",
  album_uri: string
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const extension = mediaType === "canvas" ? ".mp4" : ".jpg";

    const outputDir = path.join(os.homedir(), "images", "fastfetch", "media");
    await fs.mkdir(outputDir, { recursive: true });

    // wipe everything in the dir
    try {
      const existingFiles = await fs.readdir(outputDir);
      for (const file of existingFiles) {
        try {
          await fs.unlink(path.join(outputDir, file));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // sanitize
    const baseName = (album_uri || "media").replace(/[^\w.-]/g, "_");

    if (mediaType === "canvas") {
      const inputBuffer = Buffer.from(await response.arrayBuffer());
      const tempInputPath = path.join(
        outputDir,
        `${baseName}_input${extension}`
      );
      const outputGifPath = path.join(outputDir, `${baseName}.gif`);

      await fs.writeFile(tempInputPath, inputBuffer);

      try {
        const ffmpegImport: any = await import("fluent-ffmpeg");
        const ffmpeg = ffmpegImport.default ?? ffmpegImport;

        // ensure any gif is removed
        try {
          await fs.unlink(outputGifPath);
        } catch {}

        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(tempInputPath)
            .outputFormat("gif")
            .outputOptions(["-vf", "fps=15,scale=480:-1:flags=lanczos"])
            .on("end", () => {
              console.log(`Downloaded canvas: ${outputGifPath}`);
              resolve();
            })
            .on("error", (err: any) => reject(err))
            .save(outputGifPath);
        });

        // after conversion, remove any mp4s that match the baseName
        try {
          const postFiles = await fs.readdir(outputDir);
          for (const f of postFiles) {
            if (
              f.startsWith(baseName) &&
              path.extname(f).toLowerCase() === extension
            ) {
              try {
                await fs.unlink(path.join(outputDir, f));
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      } catch (err) {
        const fallbackPath = path.join(outputDir, `${baseName}${extension}`);
        try {
          await fs.unlink(fallbackPath);
        } catch {}
        await fs.writeFile(fallbackPath, inputBuffer);
        console.log(`Downloaded canvas (video): ${fallbackPath}`);
      } finally {
        try {
          await fs.unlink(tempInputPath);
        } catch {}
      }

      return;
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    const filePath = path.join(outputDir, `${baseName}${extension}`);
    const tmpPath = path.join(outputDir, `${baseName}.tmp`);

    // ensure no existing file
    try {
      await fs.unlink(filePath);
    } catch {}

    await fs.writeFile(tmpPath, buffer);
    await fs.rename(tmpPath, filePath);
    console.log(`Downloaded cover: ${filePath}`);
  } catch (error) {
    console.error(`Download failed: ${error}`);
  }
}
