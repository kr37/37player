// Copies the one app file (with help.json and the starter track beside it)
// into dist/ before `tauri dev` and `tauri build`, so the desktop app runs
// 37-player.html as is. Without libraries/starter.mp3 the webview's server
// answers that address with index.html, which was stored as the starter track.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const dist = join(here, "dist");

mkdirSync(join(dist, "libraries"), { recursive: true });
copyFileSync(join(repo, "37-player.html"), join(dist, "index.html"));
copyFileSync(join(repo, "help.json"), join(dist, "help.json"));
copyFileSync(join(repo, "libraries", "starter.mp3"), join(dist, "libraries", "starter.mp3"));
console.log("copied 37-player.html, help.json and the starter track into dist/");
