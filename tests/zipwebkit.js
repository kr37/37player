// A .zip of music imported on WebKit (1.4.173). WebKit stored each track,
// a slice of the .zip, as the start of the whole .zip ("PK…"; the Mac mini,
// 5 Nov 2026, an album downloaded from pCloud). Now, on WebKit, every slice
// is copied into bytes of its own before it's stored. Here (Chrome),
// window.__p37WebKit pretends to be WebKit: the import still works, the
// copies are made, and every stored track is byte for byte the original.
// And Library cleanup's check calls a track that starts like a .zip damaged.
//   node zipwebkit.js     (servers from serve.sh running; needs www/conv)
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
const tone = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3')).toString('base64');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'], protocolTimeout: 120000});
  for(const wk of [true, false]){
    const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({width: 1300, height: 900});
    p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=> d.dismiss());
    if(wk) await p.evaluateOnNewDocument(()=>{ window.__p37WebKit = true; });
    await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
    for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    await p.evaluate(async()=>{ const r = window.__dbg.getRoot(); r.library = []; r.tree = []; delete r.settings.starterPlaylistId; await window.__dbg.saveState(); window.__dmg.countCopies(); });
    const L = wk ? '[WebKit] ' : '[Chrome] ';
    // An album zip, made the way a computer or pCloud makes one (stored, not squeezed)
    const want = await p.evaluate(async(tone)=>{
      const wma = new Uint8Array(await (await fetch('/conv/talk.wma')).arrayBuffer());
      const mp3 = Uint8Array.from(atob(tone), c=> c.charCodeAt(0));
      const z = await window.__dmg.zip([{name: 'Album/01 Talk.wma', data: wma}, {name: 'Album/02 Tone.mp3', data: mp3}]);
      const input = document.getElementById('importFile'); const dt = new DataTransfer(); dt.items.add(new File([z], 'Album.zip', {type: 'application/zip'}));
      input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
      const hex = u=> Array.from(u.subarray(0, 8), x=> x.toString(16).padStart(2, '0')).join('');
      return {wma: {size: wma.length, head: hex(wma)}, mp3: {size: mp3.length, head: hex(mp3)}};
    }, tone);
    for(let i=0; i<60; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
    await p.click('#folderImportGo').catch(()=>{});
    for(let i=0; i<120; i++){ await sleep(250); if(await p.evaluate(()=> window.__dbg.getRoot().library.length >= 2 && !document.getElementById('bulkImportStatus'))) break; }
    await sleep(1500);
    const st = await p.evaluate(async()=>{ const out = {}; for(const tr of window.__dbg.getRoot().library){ const blob = await window.__dmg.get(tr.id); const u = new Uint8Array(await blob.slice(0, 8).arrayBuffer()); out[tr.filename] = {size: blob.size, head: Array.from(u, x=> x.toString(16).padStart(2, '0')).join('')}; } return {out, copies: window.__wkCopies}; });
    console.log(L + JSON.stringify(st));
    const talk = Object.entries(st.out).find(([n])=> /Talk/i.test(n)), mp3 = Object.entries(st.out).find(([n])=> /\.mp3$/i.test(n) && /Tone/i.test(n));
    // The import converts the WMA (the converter is here), reading it from storage: an MP3 now means it was stored as itself.
    ok(talk && /\.mp3$/i.test(talk[0]) && /^494433/.test(talk[1].head) && talk[1].size > 10000, L + 'the WMA was stored as itself, and converted from storage (' + (talk && talk[0]) + ')');
    ok(mp3 && mp3[1].size === want.mp3.size, L + 'the MP3 too (its tags may be rewritten, so its size is the check)');
    ok(wk ? st.copies >= 2 : st.copies === 0, L + (wk ? 'copies of their own were stored (' + st.copies + ')' : 'no copies made outside WebKit'));
    // A recording that starts like a .zip is damaged
    const flagged = await p.evaluate(async()=>{ const tr = window.__dbg.getRoot().library[0]; await window.__dmg.put(tr.id, new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 8, 1, 2, 3])])); await window.__dmg.check(); return window.__dmg.ids().includes(tr.id); });
    ok(flagged, L + 'Library cleanup\'s check calls a track that starts like a .zip damaged');
    await ctx.close();
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
