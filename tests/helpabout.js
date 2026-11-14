// About in Help (2.5.006, Gen Rinzin): people without the PIN can't open
// Settings, so Help's last topic, just above Send feedback, says what
// Settings → About says: the version, where it runs from, the converter,
// Check for updates. The version popover's About button goes there too.
//   node helpabout.js
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({width: 1300, height: 900});
  p.on('pageerror', e=> console.log('PAGE ERROR:', e.message));
  await p.evaluateOnNewDocument(()=>{ window.__noAutoConverter = true; });
  await p.goto('http://localhost:8861/37-player.html', {waitUntil: 'networkidle0'}); await sleep(700);
  for(const x of ['^English$', '^Start a library on this device$', '^No, just start$', '^Skip for now$', '^Finish$']){ await clickText(p, '.modal button', x); await sleep(300); }
  await p.evaluate(()=> document.querySelectorAll('.modal [data-close]').forEach(x=> x.click()));
  const about = ()=> p.evaluate(()=>{ const q = id=> (document.querySelector('#' + id) || {}).textContent || ''; return {ver: q('aboutVersion'), run: q('aboutRunning'), conv: q('aboutConverter'), upd: !!document.querySelector('#checkUpdates'), fb: !!document.querySelector('#aboutFeedback'), link: !!document.querySelector('a[href="https://37player.com/"]')}; });
  // What Settings says.
  await p.evaluate(()=> document.getElementById('btnSettings').click()); await sleep(400);
  await clickText(p, '#settingsNav *', '^About$'); await sleep(900);
  const inSettings = await about();
  ok(/^Version \d/.test(inSettings.ver) && inSettings.run && /Converter/.test(inSettings.conv) && inSettings.upd, 'Settings → About as before (' + inSettings.ver + ')');
  // Help: the last topic, above Send feedback.
  await p.evaluate(()=> document.getElementById('btnHelp').click()); await sleep(400);
  const rail = await p.evaluate(()=>{ const rows = [...document.querySelectorAll('#helpTopicsList .playlist-row')]; const last = rows[rows.length - 1], fb = document.getElementById('helpFeedback'); return {n: rows.length, last: last.textContent.trim(), above: !fb || last.getBoundingClientRect().bottom <= fb.getBoundingClientRect().top}; });
  ok(rail.last === 'About' && rail.n > 5 && rail.above, 'Help\'s last topic is About, above Send feedback (' + rail.n + ' topics)');
  await p.evaluate(()=> document.getElementById('helpAboutRow').click()); await sleep(900);
  const inHelp = await about();
  ok(inHelp.ver === inSettings.ver && inHelp.run === inSettings.run && inHelp.conv === inSettings.conv && inHelp.upd && inHelp.link, 'it says what Settings says: version, where it runs from, converter, Check for updates');
  ok(!inHelp.fb, 'without a second Send feedback (the one below the list serves)');
  ok(await p.evaluate(()=> document.querySelector('#helpTopicBody h2').textContent === 'About' && document.querySelector('#helpAboutRow').classList.contains('active')), 'headed and marked like any topic');
  // Another topic and back.
  await p.evaluate(()=> document.querySelector('#helpTopicsList .playlist-row').click()); await sleep(200);
  ok(await p.evaluate(()=> !document.querySelector('#helpAboutBody')), 'another topic replaces it');
  await p.evaluate(()=> document.getElementById('helpAboutRow').click()); await sleep(300);
  // The version popover's About button.
  await p.evaluate(()=> document.getElementById('helpClose').click()); await sleep(200);
  const opened = await p.evaluate(()=>{ window.__dbg.setMode('library'); document.getElementById('railToggle').click(); return true; }); await sleep(300);
  if(opened && await p.$('#aboutPopover .ab-about')){
    await p.evaluate(()=> document.querySelector('#aboutPopover .ab-about').click()); await sleep(600);
    ok(await p.evaluate(()=> !!document.querySelector('#helpPage #helpAboutBody') && !document.querySelector('#settingsPage')), 'the version popover\'s About opens Help\'s About, not Settings');
  } else ok(false, 'the version popover opens');
  console.log(fails ? fails + ' FAILED' : 'ALL OK'); await b.close();
})();
