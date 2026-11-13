// Wrap and Album both on, a narrow window (2.3.005; Gen Rinzin, 13 Nov
// 2026: the album kept one line at full width, leaving the title two
// characters wide and fifteen lines tall). The album wraps too, and takes
// at most a third of the row.
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
  const measure = async (wrap)=>{
    await p.evaluate(async(wrap)=>{
      const r = window.__dbg.getRoot(); r.settings.showAlbumColumn = true; r.settings.wrapNames = wrap; r.settings.uiScale = 1;
      if(!r.library.some(t=> t.id === 'wa')){
        r.library.push({id:'wa', name:'The actual practice of generation stage', album:'Essence of Vajrayana - Songs of the Vajra Father', duration:60, peaks:[0.2,0.4]});
        r.tree.push({id:'plw', kind:'playlist', name:'W', items:[{id:'w1', kind:'track', refId:'wa', order:0}, {id:'w2', kind:'track', refId:'wa', order:1}]});
      }
      await window.__dbg.saveState(); window.__dbg.setMode('playing');
    }, wrap);
    await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
    await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click());
    await p.evaluate(()=>{ window.__dbg.setMode('playing'); [...document.querySelectorAll('.playlist-row')].find(r=> /W/.test(r.textContent))?.click(); }); await sleep(800);
    return p.evaluate(()=>{
      const row = [...document.querySelectorAll('#playingTrackList .item-row')].find(r=> !r.classList.contains('playing') && !r.classList.contains('next-selected') && r.querySelector('.talbum')) || document.querySelector('#playingTrackList .item-row');
      if(!row) return {none: document.querySelectorAll('.playlist-row').length, rows: document.querySelectorAll('.item-row').length};
      const tn = row.querySelector('.tn').getBoundingClientRect(), al = row.querySelector('.talbum').getBoundingClientRect(), rw = row.getBoundingClientRect();
      return {row: Math.round(rw.width), tn: Math.round(tn.width), tnH: Math.round(tn.height), al: Math.round(al.width), alH: Math.round(al.height)};
    });
  };
  const w = await measure(true);
  console.log('wrap on:', JSON.stringify(w));
  ok(w && w.al <= w.row / 3 + 1 && w.alH > 20, 'with Wrap on, the album wraps and takes at most a third of the row');
  ok(w && w.tn > w.al && w.tn >= 100, 'and the title keeps the larger share (' + (w && w.tn) + 'px to ' + (w && w.al) + 'px)');
  const n = await measure(false);
  console.log('wrap off:', JSON.stringify(n));
  ok(n && n.alH < 22, 'with Wrap off, the album stays on one line');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
