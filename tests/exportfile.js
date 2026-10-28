// Exporting without a zip: one selected track as just its file (a plain
// download), several as separate files into a folder (here a stand-in for
// the folder picker); a name already in the folder isn't replaced.
//   node exportfile.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms)); const fs = require('fs'), path = require('path');
const APP = 'http://localhost:8861/37-player.html';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
async function importAs(p, from, as){
  await p.evaluate(async(from, as)=>{ const blob = await (await fetch('/' + from)).blob(); window.__dbg.bulkImportFolder([new File([blob], as, {type: blob.type || 'audio/mpeg'})]); }, from, as);
  for(let k=0; k<60; k++){ const h = await p.evaluate(()=> document.querySelector('.modal h3')?.textContent || ''); if(/Review/.test(h)) await clickText(p, '.modal button', '^Import$'); if(/Import finished/.test(h)){ await p.evaluate(()=> document.querySelectorAll('.modal [data-close], .modal .btn.primary').forEach(x=>x.click())); break; } await sleep(200); }
}
(async()=>{
  const dl = path.join(__dirname, 'shots', 'downloads'); fs.rmSync(dl, {recursive: true, force: true}); fs.mkdirSync(dl, {recursive: true});
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await b.newPage(); await p.setViewport({width: 1200, height: 900});
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: dl});
  await p.evaluateOnNewDocument(()=>{
    window.__noAutoConverter = true;
    // a stand-in for the folder picker: an in-memory folder that already holds "ten.mp3"
    window.__folder = {"ten.mp3": 1};
    window.showDirectoryPicker = async ()=>({
      getFileHandle: async (name, o)=>{ if(!(name in window.__folder) && !(o && o.create)) throw new DOMException('no', 'NotFoundError'); return {createWritable: async ()=>{ const parts = []; return {write: async (x)=> parts.push(x), close: async ()=>{ window.__folder[name] = new Blob(parts).size; }}; }}; },
    });
  });
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message)); p.on('dialog', d=>{ console.log('ALERT:', d.message()); d.dismiss(); });
  await p.goto(APP, {waitUntil: 'networkidle0'}); await sleep(600);
  for(const x of ['^English$', '^Start a library on this device$','^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await importAs(p, 'ten.mp3', 'ten.mp3');
  await importAs(p, 'w_mono48.wav', 'Second.wav');
  const ids = await p.evaluate(()=> window.__dbg.getRoot().library.map(t=> ({id: t.id, name: t.name, file: t.filename})));
  console.log('tracks:', JSON.stringify(ids));
  const ten = ids.find(t=> /ten/.test(t.file)), two = ids.find(t=> /Second/.test(t.file));
  // one track
  await p.evaluate((id)=> window.__exp.select([id]), ten.id); await sleep(300);
  await p.evaluate(()=> window.__exp.dialog()); await sleep(400);
  await p.evaluate(()=>{ document.querySelector('input[name=exportFmt][value=portable]').click(); }); await sleep(200);
  const one = await p.evaluate(()=> ({shown: document.getElementById('exportSaveAs').style.display !== 'none', file: document.getElementById('exportSaveFileRow').style.display !== 'none', folder: document.getElementById('exportSaveFolderRow').style.display !== 'none'}));
  ok(one.shown && one.file && !one.folder && await p.evaluate(()=> document.querySelector('input[name=exportSave]:checked').value) === 'file', 'one track, Portable: "Save as" offers Just the file, chosen to begin with');
  await p.screenshot({path: 'shots/exportfile-dialog.png'});
  await p.evaluate(()=>{ document.querySelector('input[name=exportFmt][value=native]').click(); }); await sleep(100);
  ok(await p.evaluate(()=> document.getElementById('exportSaveAs').style.display === 'none'), 'not for a Native export (that\'s a 37 Player archive)');
  await p.evaluate(()=>{ document.querySelector('input[name=exportFmt][value=portable]').click(); document.querySelector('input[name=exportSave][value=file]').click(); document.getElementById('exportGo').click(); });
  let got = [];
  for(let k = 0; k < 40; k++){ got = fs.readdirSync(dl).filter(f=> !/\.crdownload$/.test(f)); if(got.length) break; await sleep(250); }
  ok(got.length === 1 && /\.mp3$/.test(got[0]) && !/\.zip$/.test(got[0]) && fs.statSync(path.join(dl, got[0])).size > 100000, 'Just the file downloads the MP3 itself, not a zip: ' + got.join(', '));
  // two tracks, into a folder that already has a ten.mp3
  await p.evaluate((a, b)=> window.__exp.select([a, b]), ten.id, two.id); await sleep(300);
  await p.evaluate(()=> window.__exp.dialog()); await sleep(400);
  await p.evaluate(()=>{ document.querySelector('input[name=exportFmt][value=portable]').click(); }); await sleep(200);
  const many = await p.evaluate(()=> ({file: document.getElementById('exportSaveFileRow').style.display !== 'none', folder: document.getElementById('exportSaveFolderRow').style.display !== 'none'}));
  ok(!many.file && many.folder, 'two tracks: "Separate files, in a folder you choose"');
  await p.evaluate(()=>{ document.querySelector('input[name=exportSave][value=folder]').click(); document.getElementById('exportGo').click(); });
  let folder = {};
  for(let k = 0; k < 40; k++){ folder = await p.evaluate(()=> window.__folder); if(Object.keys(folder).length >= 3) break; await sleep(250); }
  console.log('folder:', JSON.stringify(folder));
  const names = Object.keys(folder);
  ok(folder['ten.mp3'] === 1 && names.some(n=> /^ten \(2\)\.mp3$/i.test(n) || /^.*\(2\)\.mp3$/.test(n)) && names.some(n=> /Second\.wav$/.test(n)) && names.length === 3, 'both files land in the folder, the one already there untouched: ' + names.join(' | '));
  ok(fs.readdirSync(dl).length === 1, 'and nothing else was downloaded');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
