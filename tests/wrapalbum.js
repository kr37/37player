// Wrap and Album both on, a narrow window (2.3.005; kr37, 13 Nov
// 2026: the album kept one line at full width, leaving the title two
// characters wide and fifteen lines tall). The album wraps too, and takes
// at most a third of the row. And (2.7.027; kr37, 28 Nov 2026, his Pixel)
// the album gets the title's treatment everywhere: cut short with it when
// Wrap is off, and wrapped with it in the row playing or chosen next,
// whose title is always shown in full; there it had stayed on one line,
// the title one letter wide.
//   node wrapalbum.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width:420, height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html', {waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Start a library on this device$','^No, just start$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
  const measure = async (wrap, current, scale)=>{
    await p.evaluate(async(wrap, scale)=>{
      const r = window.__dbg.getRoot(); r.settings.showAlbumColumn = true; r.settings.wrapNames = wrap; r.settings.uiScale = scale || 1;
      if(!r.library.some(t=> t.id === 'wa')){
        r.library.push({id:'wa', name:'The actual practice of generation stage', album:'Essence of Vajrayana - Songs of the Vajra Father', duration:60, peaks:[0.2,0.4]});
        r.tree.push({id:'plw', kind:'playlist', name:'W', items:[{id:'w1', kind:'track', refId:'wa', order:0}, {id:'w2', kind:'track', refId:'wa', order:1}]});
      }
      await window.__dbg.saveState(); window.__dbg.setMode('playing');
    }, wrap, scale);
    await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    await p.evaluate(()=>{ window.__dbg.setMode('playing'); [...document.querySelectorAll('.playlist-row')].find(r=> /W/.test(r.textContent))?.click(); }); await sleep(800);
    if(current) await p.evaluate(()=>{ const r = document.querySelector('#playingTrackList .item-row'); r && r.click(); }); await sleep(400);
    return p.evaluate((current)=>{
      const row = current ? document.querySelector('#playingTrackList .item-row.playing, #playingTrackList .item-row.next-selected')
        : [...document.querySelectorAll('#playingTrackList .item-row')].find(r=> !r.classList.contains('playing') && !r.classList.contains('next-selected') && r.querySelector('.talbum')) || document.querySelector('#playingTrackList .item-row');
      if(!row) return {none: document.querySelectorAll('.playlist-row').length, rows: document.querySelectorAll('.item-row').length};
      const tn = row.querySelector('.tn').getBoundingClientRect(), al = row.querySelector('.talbum').getBoundingClientRect(), rw = row.getBoundingClientRect();
      return {row: Math.round(rw.width), tn: Math.round(tn.width), tnH: Math.round(tn.height), al: Math.round(al.width), alH: Math.round(al.height), alCut: getComputedStyle(row.querySelector('.talbum')).textOverflow};
    }, current);
  };
  const w = await measure(true);
  console.log('wrap on:', JSON.stringify(w));
  ok(w && w.al <= w.row / 3 + 1 && w.alH > 20, 'with Wrap on, the album wraps and takes at most a third of the row');
  ok(w && w.tn > w.al && w.tn >= 100, 'and the title keeps the larger share (' + (w && w.tn) + 'px to ' + (w && w.al) + 'px)');
  const n = await measure(false);
  console.log('wrap off:', JSON.stringify(n));
  ok(n && n.alH < 22, 'with Wrap off, the album stays on one line');
  // Larger, as on the Pixel (scale 1.3 in a 420 px window): with Wrap off,
  // both cut short, the title keeping the larger share.
  const n2 = await measure(false, false, 1.3);
  console.log('wrap off, larger:', JSON.stringify(n2));
  ok(n2 && n2.alH < 30 && n2.al <= n2.row * 0.22 + 1 && n2.tn > n2.al, 'larger, Wrap off: the album is cut short too, and the title keeps the larger share (' + (n2 && n2.tn) + 'px to ' + (n2 && n2.al) + 'px)');
  // The row chosen next (its title always in full): the album wraps with it.
  const c = await measure(false, true, 1.3);
  console.log('wrap off, the row chosen next:', JSON.stringify(c));
  ok(c && c.tn > c.al && c.tn >= 100 && c.al <= c.row * 0.22 + 1, 'in the row playing or chosen next, the album wraps with its title, which keeps the larger share (' + (c && c.tn) + 'px to ' + (c && c.al) + 'px)');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
