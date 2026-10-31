// Send feedback (1.4.136): the form in Help, posted to the real feedback.php
// (under php -S, its mail caught by a stand-in sendmail): the message and
// logs kept on the server, mailed only to the developer, the reply address
// only as Reply-To, what was sent listed on the device, and the rate limit.
//   node feedback.js        (needs PHP; starts its own server on 8874)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), os = require('os'), {spawn, execFileSync} = require('child_process');
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const clickText = (p, sel, src) => p.evaluate((sel, src)=>{ const re=new RegExp(src); const el=[...document.querySelectorAll(sel)].find(e=>e.offsetParent!==null && re.test(e.textContent.trim())); if(el){ el.click(); return true; } return false; }, sel, src);
(async()=>{
  execFileSync('python3', [path.join(__dirname, 'make-debug-copy.py')]);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p37fb-')), www = path.join(root, 'www'), data = path.join(root, 'data'), mail = path.join(root, 'mail.txt');
  fs.mkdirSync(www); fs.mkdirSync(data);
  fs.copyFileSync(path.join(__dirname, 'www', '37-player.html'), path.join(www, '37-player.html'));
  fs.copyFileSync(path.join(__dirname, '..', 'feedback.php'), path.join(www, 'feedback.php'));
  const php = spawn('php', ['-d', 'sendmail_path=cat >> ' + mail, '-S', '127.0.0.1:8874', '-t', www], {env: Object.assign({}, process.env, {SYNC37_DATA_DIR: data}), stdio: 'ignore'});
  await sleep(800);
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  try{
    const p = await b.newPage(); await p.setViewport({width: 1300, height: 900});
    p.on('pageerror', e=>{ console.log('PAGE ERROR:', e.message); fails++; });
    await p.goto('http://127.0.0.1:8874/37-player.html', {waitUntil: 'networkidle0'}); await sleep(800);
    for(const x of ['^English$', '^No, just start$']){ await clickText(p, '.modal button', x); await sleep(300); }
    await p.evaluate(()=> document.getElementById('btnHelp').click()); await sleep(400);
    ok(await p.evaluate(()=> document.getElementById('helpFeedback')?.textContent) === 'Send feedback…', 'Help has Send feedback…');
    await p.evaluate(()=> document.getElementById('helpFeedback').click()); await sleep(300);
    const form = await p.evaluate(()=> document.querySelector('.modal')?.innerText || '');
    ok(/the author of 37 Player/.test(form) && !/Gen Rinzin/.test(form) && /playback log \(\d+ lines\)/.test(form), 'the form says who it goes to and lists the playback log: ' + form.split('\n').slice(0, 3).join(' / '));
    await p.evaluate(()=> document.getElementById('fbSend').click()); await sleep(200);
    ok(/Write something first/.test(await p.evaluate(()=> document.getElementById('fbMsg').textContent)), 'an empty message isn\'t sent');
    await p.evaluate(()=>{ document.getElementById('fbMessage').value = 'The iPad stopped at a stop\nand then nothing'; document.getElementById('fbReply').value = 'someone@example.org'; document.getElementById('fbSend').click(); });
    for(let i = 0; i < 40 && !/Thank you/.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')); i++) await sleep(200);
    ok(/Thank you/.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')), 'sent: "Thank you"');
    const dirs = fs.readdirSync(path.join(data, 'feedback')).filter(d=> d !== 'rate');
    ok(dirs.length === 1, 'one message kept on the server: ' + dirs.join(','));
    const kept = dirs.length ? fs.readdirSync(path.join(data, 'feedback', dirs[0])) : [];
    ok(kept.includes('message.txt') && kept.some(f=> /^37player-playback-log.*\.txt$/.test(f)), 'with the message and the playback log: ' + kept.join(', '));
    const msg = dirs.length ? fs.readFileSync(path.join(data, 'feedback', dirs[0], 'message.txt'), 'utf8') : '';
    ok(/The iPad stopped/.test(msg) && /Version: \d/.test(msg) && /Reply to: someone@example\.org/.test(msg), 'the message says what, which version, and whom to reply to');
    const m = fs.existsSync(mail) ? fs.readFileSync(mail, 'utf8') : '';
    ok(/^To: rinzin@kr37\.net/m.test(m), 'mailed to rinzin@kr37.net');
    ok(/^Reply-To: someone@example\.org/m.test(m) && !/^(To|Cc|Bcc):.*someone@/m.test(m), 'the reply address only as Reply-To');
    const subj = (m.match(/^Subject: =\?UTF-8\?B\?([^?]+)\?=/m) || [])[1];
    ok(subj && Buffer.from(subj, 'base64').toString('utf8') === '37-Player: The iPad stopped at a stop', 'subject: "37-Player: " and the first line');
    ok(/filename="37player-playback-log/.test(m), 'the log attached');
    // listed on the device
    await clickText(p, '.modal button', '^OK$'); await sleep(200);
    await p.evaluate(()=> document.getElementById('helpFeedback').click()); await sleep(300);
    ok(/Sent from this device \(1\)/.test(await p.evaluate(()=> document.querySelector('.modal')?.innerText || '')) && await p.evaluate(()=> document.getElementById('fbReply').value) === 'someone@example.org', 'the form lists what was sent, and remembers the reply address');
    // the rate limit: 6 an hour
    const codes = await p.evaluate(async()=>{ const out = []; for(let i = 0; i < 6; i++){ const r = await fetch('feedback.php?op=send', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: 'x' + i})}); out.push(r.status); } return out; });
    ok(codes.slice(0, 5).every(c=> c === 200) && codes[5] === 429, 'the seventh message in an hour is refused: ' + codes.join(','));
    // another site can't send through it
    const other = await p.evaluate(async()=>{ const r = await fetch('feedback.php?op=status'); return r.status; });
    ok(other === 200, 'status answers this site');
  } finally {
    await b.close(); php.kill();
    fs.rmSync(root, {recursive: true, force: true});
  }
  console.log(fails ? fails + ' FAILED' : 'ALL OK');
  process.exit(fails ? 1 : 0);
})();
