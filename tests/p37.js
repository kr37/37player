// Backups as .37p (1.4.092): a backup downloads as .37p (still a zip
// inside), and restores both when picked in Import / Export and when opened
// with 37 Player (an installed app claims the extension).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), os = require('os');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const STARTER = fs.readFileSync(path.join(__dirname, 'fixtures', 'starter.mp3')).toString('base64');
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const waitFile = async (dir, re)=>{ for(let i=0;i<200;i++){ const f = fs.readdirSync(dir).find(n=> re.test(n) && !/\.crdownload$/.test(n)); if(f) return f; await sleep(150); } return null; };
async function open(b){
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage(); await p.setViewport({width:1100,height:900});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('dialog', d=> d.accept());
  p.dl = fs.mkdtempSync(path.join(os.tmpdir(), 'p37-'));
  const cdp = await p.createCDPSession(); await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: p.dl, browserContextId: ctx._contextId || ctx.id}).catch(()=> cdp.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: p.dl}));
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  for(const x of ['^English$','^No, just start$']){ await clickText(p,'.modal button',x); await sleep(400); }
  await p.evaluate(()=>{ window.backupInfoForTest().handle = null; });
  return p;
}
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const A = await open(b);
  await A.evaluate((b64)=>{ const f = new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], 'starter.mp3', {type:'audio/mpeg'}); Object.defineProperty(f,'webkitRelativePath',{value: 'Set/starter.mp3'}); window.__dbg.bulkImportFolder([f]); }, STARTER);
  for(let i=0; i<60; i++){ await sleep(250); if(await A.$('#folderImportGo')) break; }
  await A.click('#folderImportGo').catch(()=>{});
  for(let i=0; i<80; i++){ await sleep(250); if(await A.evaluate(()=> window.__dbg.getRoot().library.length && !document.getElementById('bulkImportStatus'))) break; }
  await sleep(1200);
  for(const x of ['^OK$','^Close$','^Not now$','^Keep them$']){ await clickText(A,'.modal button',x); await sleep(300); }
  const track = await A.evaluate(()=> window.__dbg.getRoot().library[0].name);
  A.evaluate(()=>{ window.__share.manualBackup(); });
  for(let i=0; i<40 && !(await clickText(A, '#askButtons button', '^New full backup')); i++) await sleep(150);
  const name = await waitFile(A.dl, /\.37p$/);
  ok(/^lib-native-backup-full-.*\.37p$/.test(name || ''), 'a backup downloads as .37p: ' + name);
  const bytes = fs.readFileSync(path.join(A.dl, name));
  ok(bytes[0] === 0x50 && bytes[1] === 0x4B, 'and is a zip inside');
  // Picked in Import / Export, in a fresh browser
  const B = await open(b);
  ok(await B.evaluate(()=> /\.37p/.test(document.getElementById('importFile').accept)), 'the import picker takes .37p (on a computer)');
  await (await B.$('#importFile')).uploadFile(path.join(A.dl, name));
  for(let i=0; i<40 && !(await B.$('#mergeGo, #replaceGo')); i++) await sleep(200);
  ok(!!(await B.$('#mergeGo, #replaceGo')), 'picking it offers to restore it');
  await B.evaluate(()=> (document.getElementById('replaceGo') || document.getElementById('mergeGo')).click());
  for(let i=0; i<80; i++){ if(await B.evaluate((n)=> window.__dbg.getRoot().library.some(t=> t.name === n), track)) break; await sleep(250); }
  ok(await B.evaluate((n)=> window.__dbg.getRoot().library.some(t=> t.name === n), track), 'and restores it: “' + track + '”');
  // Opened with 37 Player
  const C = await open(b);
  await C.evaluate((b64, n)=>{ window.__openWith([new File([Uint8Array.from(atob(b64), c=>c.charCodeAt(0))], n)]); }, bytes.toString('base64'), name);
  for(let i=0; i<40 && !(await C.$('#mergeGo, #replaceGo')); i++) await sleep(200);
  ok(!!(await C.$('#mergeGo, #replaceGo')), 'opened with 37 Player, a .37p offers to restore (not "no audio found")');
  // iPad: the picker isn't limited by type
  const ctx = await b.createBrowserContext(); const D = await ctx.newPage();
  await D.setUserAgent('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await D.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(800);
  ok(await D.evaluate(()=> !document.getElementById('importFile').hasAttribute('accept')), 'on an iPad the import picker takes any file (iOS may grey out .37p)');
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); process.exit(fails ? 1 : 0);
})();
