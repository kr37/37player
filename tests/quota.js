// Storage filling up during a folder import (as in an incognito window): the
// import must stop at once, close its progress dialog and say why, never hang.
// Simulated by making IndexedDB writes throw QuotaExceededError after a few
// files. Fixture: tests/www/stopimp (make-fixtures.sh).
const puppeteer = require('puppeteer-core'); const path = require('path'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const DIR = path.join(__dirname, 'www', 'stopimp', 'Set');
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^Skip for now$','^Finish$']){ await clickText(p,'.modal button',x); await sleep(300); }
  await p.evaluate(()=> document.querySelector('.modal [data-close]')?.click()); await sleep(300);
  const cdp = await p.target().createCDPSession();
  const {root} = await cdp.send('DOM.getDocument');
  const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#bulkFolderInput'});
  await cdp.send('DOM.setFileInputFiles', {nodeId, files: [DIR]});
  for(let i=0; i<120; i++){ await sleep(250); if(await p.$('#folderImportGo')) break; }
  await p.click('#reviewFolderPlaylists').catch(()=>{});
  // From the 4th audio file on, every write is refused for lack of room.
  await p.evaluate(()=>{
    let audioPuts = 0, full = false;
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...a){
      if(this.name === 'audio' && ++audioPuts > 3) full = true;
      if(full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return orig.apply(this, a);
    };
  });
  await p.click('#folderImportGo');
  let h3 = '';
  for(let i=0; i<200; i++){ await sleep(150); h3 = await p.evaluate(()=> document.getElementById('bulkImportStatus') ? '' : (document.querySelector('.modal-backdrop.show .modal h3')?.textContent || '')); if(h3) break; }
  const text = await p.evaluate(()=> document.querySelector('.modal')?.textContent || '');
  console.log('dialog:', h3, '|', text.slice(0, 300));
  ok(!!h3 && !(await p.$('#bulkImportStatus')), 'the progress dialog closes (it no longer hangs)');
  ok(/ran out of room|no more room/.test(text), 'and says the browser ran out of room');
  ok(await p.evaluate(()=> document.getElementById('globalOperationBar').style.display === 'none'), 'the bottom bar is cleared');
  ok(!(await p.$('#stopDone')), 'no stop dialog asking about playlists');
  console.log(fails? fails+' FAILED':'ALL OK'); await b.close();
})();
