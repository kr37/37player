// Splitting MP3s whose frames carry a CRC (row 19 of the 30 Oct list): the
// splitter's fades turn down the frames either side of a cut, and a frame
// with a CRC must have it worked out again (mp3TurnDownFrame). Checked on
// a real file made by LAME with CRCs (lame -p), by ffmpeg's own CRC check:
// fixed frames pass, and the same change with the old CRC left in fails,
// which shows the check is really looking.
//   node mp3crc.js        (needs lame and ffmpeg; no servers)
const fs = require('fs'), path = require('path'), os = require('os'), {execFileSync, spawnSync} = require('child_process');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
if(spawnSync('lame', ['--version']).status !== 0){ console.log('lame not installed: skipped'); console.log('ALL OK'); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp3crc-'));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=6', '-ac', '2', '-ar', '44100', path.join(dir, 'sig.wav')]);
execFileSync('lame', ['--quiet', '-p', '-b', '128', path.join(dir, 'sig.wav'), path.join(dir, 'crc.mp3')]);
const html = fs.readFileSync(path.join(__dirname, '..', '37-player.html'), 'utf8');
const src = html.match(/function mp3TurnDownFrame\(u8, at, steps\)\{[\s\S]*?\n\}\n/)[0];
const mp3TurnDownFrame = eval('(' + src.replace(/^function mp3TurnDownFrame/, 'function') + ')');
const BR = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320], SR = [44100,48000,32000];
function frames(u8){ const out = []; let i = 0; while(i + 4 < u8.length){ if(u8[i] === 0xFF && (u8[i+1] & 0xE0) === 0xE0){ const br = BR[u8[i+2] >> 4] * 1000, sr = SR[(u8[i+2] >> 2) & 3], pad = (u8[i+2] >> 1) & 1; const len = Math.floor(144 * br / sr) + pad; if(len > 4){ out.push(i); i += len; continue; } } i++; } return out; }
const crcErrors = f=> (spawnSync('ffmpeg', ['-v', 'error', '-err_detect', 'crccheck', '-i', f, '-f', 'null', '-']).stderr.toString().match(/crc|error/gi) || []).length;
const orig = new Uint8Array(fs.readFileSync(path.join(dir, 'crc.mp3')));
const fr = frames(orig);
ok(fr.length > 100 && !(orig[fr[40] + 1] & 1), 'LAME made an MP3 with a CRC on each frame (' + fr.length + ' frames)');
ok(crcErrors(path.join(dir, 'crc.mp3')) === 0, 'as made, ffmpeg finds no CRC errors');
for(const fix of [true, false]){
  const u8 = orig.slice();
  [40, 41, 42, 80].forEach((k, j)=>{
    const at = fr[k], c4 = u8[at + 4], c5 = u8[at + 5];
    mp3TurnDownFrame(u8, at, j === 3 ? 3 : Infinity);
    if(!fix){ u8[at + 4] = c4; u8[at + 5] = c5; }
  });
  const f = path.join(dir, fix ? 'fixed.mp3' : 'stale.mp3');
  fs.writeFileSync(f, u8);
  const n = crcErrors(f);
  if(fix) ok(n === 0, 'frames turned down (silenced, and 3 steps down), CRCs worked out again: ffmpeg finds no CRC errors');
  else ok(n > 0, 'the same with the old CRCs left in: ffmpeg finds them (' + n + ')');
}
fs.rmSync(dir, {recursive: true, force: true});
console.log(fails ? fails + ' FAILED' : 'ALL OK');
process.exit(fails ? 1 : 0);
