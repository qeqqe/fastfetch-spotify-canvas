process.on("uncaughtException", (err) => {
  console.error(
    "uncaughtException:",
    err && (err instanceof Error ? err.stack : err)
  );
});
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

import { getCanvases } from "./canvas/getCanvas.js";

getCanvases().catch((e) => console.error("getCanvases failed:", e));
