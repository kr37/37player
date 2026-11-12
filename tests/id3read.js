// Reading an MP3's details at import (2.2.034; Gen Rinzin, 12 Nov 2026:
// Rak-ma imported an album and only the first track got its artwork,
// artist and album). The import had its own ID3 reader, which knew only
// plain v2.3/v2.4 frames; it now uses the tag writer's (parseId3Block).
// Each file here is tagged one of the ways the old reader missed, and
// title, artist, album, track number and picture must all come back.
//   node id3read.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const APP = process.env.APP || 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage();
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(800);
  const results = await p.evaluate(async()=>{
    const enc = new TextEncoder();
    const latin = s=> Uint8Array.from([...s].map(c=> c.charCodeAt(0) & 255));
    const cat = (...parts)=>{ const n = parts.reduce((a, x)=> a + x.length, 0), out = new Uint8Array(n); let i = 0; for(const x of parts){ out.set(x, i); i += x.length; } return out; };
    const be = (n, w)=>{ const o = new Uint8Array(w); for(let i = w - 1; i >= 0; i--){ o[i] = n & 255; n >>>= 8; } return o; };
    const ss = n=> Uint8Array.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
    const utf16 = s=>{ const o = [0xFF, 0xFE]; for(const c of s){ const k = c.charCodeAt(0); o.push(k & 255, k >> 8); } return Uint8Array.from(o); };
    const JPEG = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, ...new Array(60).fill(7), 0xFF, 0xD9]);
    // Frames: [id, payload]. v2: 6-byte headers; v3: plain sizes; v4: synchsafe (flags per frame optional).
    const frame = (v, id, payload, flags)=> v === 2 ? cat(latin(id), be(payload.length, 3), payload)
      : cat(latin(id), v === 4 ? ss(payload.length) : be(payload.length, 4), flags || new Uint8Array(2), payload);
    const tag = (v, frames, flags, pre)=>{ const body = cat(pre || new Uint8Array(0), ...frames, new Uint8Array(32)); return cat(latin('ID3'), Uint8Array.from([v, 0, flags || 0]), ss(body.length), body); };
    const text = s=> cat(Uint8Array.of(0), latin(s));
    const audio = cat(Uint8Array.from([0xFF, 0xFB, 0x90, 0x64]), new Uint8Array(4000));
    const v1 = (title, artist, album, track)=>{ const t = new Uint8Array(128); t.set(latin('TAG')); t.set(latin(title).slice(0, 30), 3); t.set(latin(artist).slice(0, 30), 33); t.set(latin(album).slice(0, 30), 63); if(track){ t[125] = 0; t[126] = track; } return t; };
    const read = async bytes=>{ const r = await window.__sil.tags(new File([bytes], 'x.mp3', {type: 'audio/mpeg'})); return r && {title: r.title, artist: r.artist, album: r.album, trackNo: r.trackNo, pic: r.artwork ? r.artwork.bytes.length + ' ' + r.artwork.mime : null}; };
    const pic3 = cat(Uint8Array.of(0), latin('image/jpeg'), Uint8Array.of(0, 3, 0), JPEG);
    const out = {};
    out.v23 = await read(cat(tag(3, [frame(3, 'TIT2', text('Mantra')), frame(3, 'TPE1', text('Kadampa')), frame(3, 'TALB', text('Medicine Buddha')), frame(3, 'TRCK', text('3/12')), frame(3, 'APIC', pic3)]), audio));
    out.v22 = await read(cat(tag(2, [frame(2, 'TT2', text('Mantra')), frame(2, 'TP1', text('Kadampa')), frame(2, 'TAL', text('Medicine Buddha')), frame(2, 'TRK', text('4')), frame(2, 'PIC', cat(Uint8Array.of(0), latin('JPG'), Uint8Array.of(3, 0), JPEG))]), audio));
    // v2.4: the album frame has a data length indicator (format flag 0x01: four bytes before the text).
    out.v24 = await read(cat(tag(4, [frame(4, 'TIT2', cat(Uint8Array.of(3), enc.encode('Mantra'))), frame(4, 'TPE1', cat(Uint8Array.of(3), enc.encode('Kadampa'))), frame(4, 'TALB', cat(ss(16), Uint8Array.of(3), enc.encode('Medicine Buddha')), Uint8Array.of(0, 1)), frame(4, 'TRCK', text('5')), frame(4, 'APIC', pic3)]), audio));
    // v2.3 with an extended header (tag flag 0x40): six bytes after its size.
    out.ext = await read(cat(tag(3, [frame(3, 'TIT2', text('Mantra')), frame(3, 'TPE1', text('Kadampa')), frame(3, 'TALB', text('Medicine Buddha')), frame(3, 'TRCK', text('6')), frame(3, 'APIC', pic3)], 0x40, cat(be(6, 4), new Uint8Array(6))), audio));
    // v2.3 unsynchronised (tag flag 0x80): a 0 after every 0xFF.
    { const body = cat(frame(3, 'TIT2', text('Mantra')), frame(3, 'TPE1', text('Kadampa')), frame(3, 'TALB', text('Medicine Buddha')), frame(3, 'TRCK', text('7')), frame(3, 'APIC', pic3), new Uint8Array(32));
      const u = []; for(const x of body){ u.push(x); if(x === 0xFF) u.push(0); }
      out.unsync = await read(cat(latin('ID3'), Uint8Array.from([3, 0, 0x80]), ss(u.length), Uint8Array.from(u), audio)); }
    // UTF-16 text, the album artist only, and the front cover after another picture.
    out.utf16 = await read(cat(tag(3, [frame(3, 'TIT2', cat(Uint8Array.of(1), utf16('Mantra'))), frame(3, 'TPE2', cat(Uint8Array.of(1), utf16('Kadampa'))), frame(3, 'TALB', cat(Uint8Array.of(1), utf16('Medicine Buddha'))), frame(3, 'TRCK', text('8')),
      frame(3, 'APIC', cat(Uint8Array.of(0), latin('image/jpeg'), Uint8Array.of(0, 4, 0), JPEG.slice(0, 30))), frame(3, 'APIC', pic3)]), audio));
    // ID3v2 with the title only; the rest from ID3v1 at the end.
    out.merged = await read(cat(tag(3, [frame(3, 'TIT2', text('Mantra')), frame(3, 'APIC', pic3)]), audio, v1('Old title', 'Kadampa', 'Medicine Buddha', 9)));
    // ID3v1 only.
    out.v1 = await read(cat(audio, v1('Mantra', 'Kadampa', 'Medicine Buddha', 10)));
    return out;
  });
  const want = (k, trackNo, pic)=>{
    const r = results[k];
    const good = r && r.title === 'Mantra' && r.artist === 'Kadampa' && r.album === 'Medicine Buddha' && r.trackNo === trackNo && (pic ? r.pic === pic : !r.pic);
    ok(good, k + ': ' + JSON.stringify(r));
  };
  want('v23', 3, '66 image/jpeg');
  want('v22', 4, '66 image/jpeg');
  want('v24', 5, '66 image/jpeg');
  want('ext', 6, '66 image/jpeg');
  want('unsync', 7, '66 image/jpeg');
  want('utf16', 8, '66 image/jpeg');
  want('merged', 9, '66 image/jpeg');
  want('v1', 10, null);
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
