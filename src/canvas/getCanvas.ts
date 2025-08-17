import { getToken } from "../auth/token.ts";
import { getTrackInfo } from "../helper/getCurrentTrack.ts";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import * as canvas from "../proto/_canvas.ts";

const CANVASES_URL = "https://spclient.wg.spotify.com/canvaz-cache/v0/canvases";

interface CanvasOptions {
  headers: {
    [key: string]: string;
  };
}

export async function getCanvas(): Promise<void> {
  console.log("Starting getCanvas process...");
  const trackInfo = await getTrackInfo();
  if (!trackInfo) {
    console.log("No track info available");
    return;
  }
  console.log("Track info obtained:", trackInfo);

  const canvasRequest = new canvas.CanvasRequest();
  const spotifyTrack = new canvas.CanvasRequest.Track();
  spotifyTrack.track_uri = `spotify:track:${trackInfo.id}`;
  canvasRequest.tracks = [spotifyTrack];
  console.log("CanvasRequest built:", canvasRequest);

  const requestBytes = canvasRequest.serializeBinary();
  console.log("Serialized CanvasRequest to binary.");

  const tokens = await getToken();
  console.log("Spotify tokens obtained.");

  const options: CanvasOptions = {
    headers: {
      accept: "application/protobuf",
      "content-type": "application/x-www-form-urlencoded",
      "accept-language": "en",
      "user-agent": "Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)",
      "accept-encoding": "gzip, deflate, br",
      authorization: `Bearer ${tokens.access_token}`,
    },
  };

  try {
    console.log("Sending POST request to Spotify Canvas API...");
    const response = await fetch(CANVASES_URL, {
      method: "POST",
      headers: options.headers,
      body: Buffer.from(requestBytes),
    });

    console.log("Received response from Canvas API. Status:", response.status);

    if (!response.ok) {
      console.log(
        "Canvas API response not OK, falling back to image download."
      );
      await downloadMedia(trackInfo.images, "image");
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log("Response arrayBuffer received, deserializing...");

    const canvasData = canvas.CanvasResponse.deserializeBinary(
      new Uint8Array(arrayBuffer)
    ).toObject();

    console.log(
      "Canvas data deserialized:",
      JSON.stringify(canvasData, null, 2)
    );

    if (canvasData?.canvases?.[0]?.canvas_url) {
      console.log("Canvas URL found, downloading canvas...");
      await downloadMedia(canvasData.canvases[0].canvas_url, "canvas");
    } else {
      console.log("No canvas found, falling back to image");
      await downloadMedia(trackInfo.images, "image");
    }
  } catch (error) {
    console.log(`Canvas fetch failed: ${error}`);
    await downloadMedia(trackInfo.images, "image");
  }
}

async function downloadMedia(
  url: string,
  mediaType: "canvas" | "image"
): Promise<void> {
  try {
    console.log(`Downloading ${mediaType} from URL:`, url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get("content-type") || "";
    console.log(`Content-Type received: ${contentType}`);
    const extension = getFileExtension(contentType, mediaType);

    const buffer = await response.arrayBuffer();
    const outputDir = path.join(os.homedir(), "images", "fastfetch", "media");

    await fs.mkdir(outputDir, { recursive: true });
    console.log(`Output directory ensured: ${outputDir}`);

    const filePath = path.join(outputDir, `media${extension}`);
    await fs.writeFile(filePath, new Uint8Array(buffer));

    console.log(`Downloaded ${mediaType} as: ${filePath}`);
  } catch (error) {
    console.log(`Download failed: ${error}`);
  }
}

function getFileExtension(
  contentType: string,
  mediaType: "canvas" | "image"
): string {
  if (mediaType === "canvas") {
    if (contentType.includes("video/mp4")) return ".mp4";
    if (contentType.includes("video/webm")) return ".webm";
    if (contentType.includes("video/")) return ".mp4";
  }

  if (contentType.includes("image/jpeg")) return ".jpg";
  if (contentType.includes("image/png")) return ".png";
  if (contentType.includes("image/webp")) return ".webp";
  if (contentType.includes("image/gif")) return ".gif";

  return mediaType === "canvas" ? ".mp4" : ".jpg";
}
