import { getToken } from "../auth/spotifyAuth.ts";
import { getTrackInfo } from "../helper/getCurrentTrack.ts";
import * as canvas from "../proto/_canvas.ts";
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
      console.error("Failed to obtain access token");
      return null;
    }
    const track_info = await getTrackInfo();
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
      await downloadMedia(canvasResponse.canvases[0].canvas_url, "canvas");
    } else {
      await downloadMedia(track_info.images, "image");
    }
    return canvasResponse.toObject();
  } catch (error) {
    return null;
  }
}
async function downloadMedia(
  url: string,
  mediaType: "canvas" | "image"
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const extension = mediaType === "canvas" ? ".mp4" : ".jpg";

    const outputDir = path.join(os.homedir(), "images", "fastfetch", "media");
    await fs.mkdir(outputDir, { recursive: true });

    const files = await fs.readdir(outputDir);
    for (const file of files) {
      if (file.startsWith("media.")) {
        await fs.unlink(path.join(outputDir, file));
      }
    }

    if (mediaType === "canvas") {
      const inputBuffer = Buffer.from(await response.arrayBuffer());
      const tempInputPath = path.join(outputDir, `media_input${extension}`);
      const outputGifPath = path.join(outputDir, `media.gif`);

      await fs.writeFile(tempInputPath, inputBuffer);

      try {
        // dynamic import to avoid touching top-level imports
        const ffmpegImport: any = await import("fluent-ffmpeg");
        const ffmpeg = ffmpegImport.default ?? ffmpegImport;

        await new Promise<void>((resolve, reject) => {
          ffmpeg()
            .input(tempInputPath)
            .outputFormat("gif")
            // options for reasonable size/quality- adjust if needed
            .outputOptions(["-vf", "fps=15,scale=480:-1:flags=lanczos"])
            .on("end", () => resolve())
            .on("error", (err: any) => reject(err))
            .save(outputGifPath);
        });
      } catch (err) {
        console.log(
          "FFmpeg conversion failed, falling back to saving original video:",
          err
        );
        const fallbackPath = path.join(outputDir, `media${extension}`);
        await fs.writeFile(fallbackPath, inputBuffer);
        console.log(`Saved original media as: ${fallbackPath}`);
      } finally {
        try {
          await fs.unlink(tempInputPath);
        } catch {}
      }

      return;
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    const filePath = path.join(outputDir, `media${extension}`);
    await fs.writeFile(filePath, buffer);
  } catch (error) {
    console.log(`Download failed: ${error}`);
  }
}
