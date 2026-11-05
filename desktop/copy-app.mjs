// Copies the one app file (with help.json and the starter track beside it)
// into dist/ before `tauri dev` and `tauri build`, so the desktop app runs
// 37-player.html as is. Without libraries/starter.mp3 the webview's server
// answers that address with index.html, which was stored as the starter track.
// The converter (ffmpeg.wasm) goes in dist/ffmpeg/ too: on an http(s) address
// the app looks for it beside itself (converterBaseUrl), and the webview's
// address is http. It's the build scripts/get_ffmpeg.sh names (since 1.4.166,
// ffmpeg.wasm without SIMD, which Monterey's webview needs), downloaded from
// this repository's release, checked against the script's SHA-256 sums, and
// kept in dist/ until the script names another.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const getScript = readFileSync(join(repo, "scripts", "get_ffmpeg.sh"), "utf8");
const setting = (name) => {
  const m = getScript.match(new RegExp("^" + name + "=(\\S+)$", "m"));
  if (!m) throw new Error(`scripts/get_ffmpeg.sh has no ${name}`);
  return m[1];
};
const tag = setting("TAG"), version = setting("VERSION");
const sums = { "ffmpeg-core.js": setting("JS_SHA256"), "ffmpeg-core.wasm": setting("WASM_SHA256") };
const versionFile = join(ffmpegDir, "VERSION");
const have = existsSync(versionFile) ? readFileSync(versionFile, "utf8").trim() : "";
if (have !== version || Object.keys(sums).some((n) => !existsSync(join(ffmpegDir, n)))) {
  for (const [name, sum] of Object.entries(sums)) {
    const r = await fetch(`https://github.com/kr37/37player/releases/download/${tag}/${name}`);
    if (!r.ok) throw new Error(`ffmpeg/${name}: ${r.status}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    const got = createHash("sha256").update(bytes).digest("hex");
    if (got !== sum) throw new Error(`ffmpeg/${name}: SHA-256 ${got}, expected ${sum}`);
    writeFileSync(join(ffmpegDir, name), bytes);
    console.log(`downloaded ffmpeg/${name} (${tag})`);
  }
  writeFileSync(versionFile, version + "\n");
}
console.log(`converter: ffmpeg.wasm ${version}`);
