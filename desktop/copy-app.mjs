// Copies the one app file (with help.json and the starter track beside it)
// into dist/ before `tauri dev` and `tauri build`, so the desktop app runs
// 37-player.html as is. Without libraries/starter.mp3 the webview's server
// answers that address with index.html, which was stored as the starter track.
// The converter (ffmpeg.wasm) goes in dist/ffmpeg/ too: on an http(s) address
// the app looks for it beside itself (converterBaseUrl), and the webview's
// address is http. It's downloaded from 37player.com once and kept in dist/.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

const ffmpegDir = join(dist, "ffmpeg");
mkdirSync(ffmpegDir, { recursive: true });
for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm", "VERSION"]) {
  const target = join(ffmpegDir, name);
  if (existsSync(target)) continue;
  const r = await fetch("https://37player.com/ffmpeg/" + name);
  if (!r.ok) throw new Error(`ffmpeg/${name}: ${r.status}`);
  writeFileSync(target, Buffer.from(await r.arrayBuffer()));
  console.log(`downloaded ffmpeg/${name}`);
}
