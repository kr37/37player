// The converter test page (tests/convert/): loads ffmpeg.wasm, runs the
// gapless check, and converts the formats a browser can't play, plus a long
// WAV. Prints the page's own report. Speed here says little about a real
// device: run the page itself on the T470, an iPad and a phone for that.
//   (cd .. && python3 -m http.server 8862)   then   node convert-page.js [more files…]
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const files = ['talk.wma','lossless.m4a','ima.aif','song.aiff'].map(f=> path.join(__dirname, 'www/conv', f)).concat(process.argv.slice(2));
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox','--autoplay-policy=no-user-gesture-required'], protocolTimeout: 1800000});
  const p = await b.newPage(); await p.setViewport({width:1000,height:1200});
  p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  p.on('console', m=>{ if(m.type()==='error') console.log('console:', m.text()); });
  await p.goto('http://localhost:8862/tests/convert/', {waitUntil:'networkidle0'});
  await p.click('#loadBtn');
  await p.waitForFunction(()=> /Ready|Couldn't/.test(document.getElementById('loadStatus').textContent), {timeout: 120000});
  const load = await p.$eval('#loadStatus', e=> e.textContent);
  console.log('load:', load);
  ok(/Ready/.test(load), 'the converter loads');

  await p.click('#gapBtn');
  await p.waitForFunction(()=> !document.getElementById('gapBtn').disabled && document.querySelectorAll('#gapTable tbody tr').length === 3, {timeout: 300000});
  const gap = await p.$$eval('#gapTable tbody tr', rows=> rows.map(r=> [...r.children].slice(0,3).map(c=>c.textContent).join(' | ')));
  console.log('gapless:\n  ' + gap.join('\n  '));
  ok(gap.length === 3 && !gap.some(r=> /failed/.test(r)), 'all three formats convert in the gapless check');

  if(process.env.FMT) await p.select('#fmt', process.env.FMT);
  const input = await p.$('#files');
  await input.uploadFile(...files);
  await p.click('#convBtn');
  await sleep(500);
  await p.waitForFunction(()=> !document.getElementById('convBtn').disabled, {timeout: 1800000, polling: 1000});
  await p.click('#copyBtn'); await sleep(300);
  const report = await p.$eval('#report', e=> e.textContent);
  console.log(report);
  ok(!/FAILED/.test(report), 'every file converted');
  const to = {mp3:'MP3 192k', aac:'AAC 192k', flac:'FLAC', small:'MP3 96k'}[process.env.FMT || 'mp3'];
  ok(new RegExp('talk\\.wma .*wmav2.*→ ' + to).test(report), 'the WMA was converted to ' + to);
  ok(new RegExp('lossless\\.m4a .*alac.*→ ' + to).test(report), 'the Apple Lossless file was converted to ' + to);
  ok(new RegExp('ima\\.aif .*adpcm_ima_qt.*→ ' + to).test(report), 'the compressed AIFF was converted to ' + to);
  await p.screenshot({path: path.join(__dirname, 'shots/convert-page.png'), fullPage: true});
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})().catch(e=>{ console.log('ERROR', e); process.exit(1); });
