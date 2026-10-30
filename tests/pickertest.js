// gdrive-picker-test.html (the Google Drive sharing test) against a fake
// Google and the real token.php: two accounts in turn sign in, "pick" a
// folder holding a file put there by hand, and run the test. The second
// must find the first's run, read it and write into it. Google's picker
// itself can't be faked here: the picked folder is set directly.
//   node pickertest.js        (needs serve.sh's server on 8861)
const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const fs = require('fs'), path = require('path'), {spawn} = require('child_process');
const google = require('./fake-google');
const PAGE = 'http://localhost:8861/gdrive-picker-test.html', TOKEN = 'http://127.0.0.1:8871/token.php', DRIVE = 'http://127.0.0.1:8872';
let fails = 0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  fs.copyFileSync(path.join(__dirname, '..', 'gdrive-picker-test.html'), path.join(__dirname, 'www', 'gdrive-picker-test.html'));
  const cfgFile = path.join(__dirname, 'syncdata', 'google-config.php');
  fs.mkdirSync(path.dirname(cfgFile), {recursive: true});
  fs.writeFileSync(cfgFile, `<?php\ndefine('GOOGLE_CLIENT_ID', 'test-client');\ndefine('GOOGLE_CLIENT_SECRET', 'test-secret');\ndefine('ALLOWED_ORIGINS', ['http://localhost:8861']);\ndefine('TOKEN_URL', '${TOKEN}');\n`);
  const php = spawn('php', ['-S', '127.0.0.1:8871', '-t', '..'], {cwd: __dirname, env: Object.assign({}, process.env, {P37_GOOGLE_CONFIG: cfgFile, P37_GOOGLE_TOKEN_ENDPOINT: DRIVE + '/token', P37_GOOGLE_AUTH_ENDPOINT: DRIVE + '/o/oauth2/v2/auth'}), stdio: 'ignore'});
  const g = google.start(8872);
  await sleep(800);
  // The folder someone made in Drive, with a file put there through Drive's website.
  const top = {id: 'folderT', name: '37 Player test', mimeType: 'application/vnd.google-apps.folder', parents: ['root'], createdTime: new Date().toISOString(), modifiedTime: new Date().toISOString(), data: null, trashed: false};
  g.files.set(top.id, top);
  g.files.set('readme1', {id: 'readme1', name: 'readme.txt', mimeType: 'text/plain', parents: [top.id], createdTime: top.createdTime, modifiedTime: top.createdTime, data: Buffer.from('Put here by hand'), trashed: false});
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox']});
  async function run(account, leave){
    g.account = account;
    const p = await (await b.createBrowserContext()).newPage();
    await p.evaluateOnNewDocument((t, d)=>{ window.__p37TokenUrl = t; window.__p37DriveApi = d; }, TOKEN, DRIVE);
    p.on('pageerror', e=> console.log(account, 'PAGE ERROR:', e.message));
    await p.goto(PAGE, {waitUntil: 'networkidle0'});
    const nav = p.waitForNavigation({waitUntil: 'networkidle0'});
    await p.click('#signin'); await nav; await sleep(800);
    const who = await p.$eval('#who', e=> e.textContent);
    ok(who.includes('Signed in as ' + account), account + ': signed in through token.php: ' + who);
    ok(await p.$eval('#pick', e=> !e.disabled), 'and the folder can be chosen');
    await p.evaluate(()=> sessionStorage.setItem('p37pickerFolder', JSON.stringify({id: 'folderT', name: '37 Player test'})));
    await p.reload({waitUntil: 'networkidle0'});
    if(!leave) await p.click('#leave');
    await p.click('#go');
    for(let k = 0; k < 50 && await p.$eval('#report', e=> e.hidden); k++) await sleep(200);
    const rep = await p.$eval('#report', e=> e.textContent);
    console.log(rep.split('\n').map(l=> '      ' + l).join('\n'));
    await p.browserContext().close();
    return rep;
  }
  try{
    const r1 = await run('first@example.org', true);
    ok(/✓ See the chosen folder/.test(r1) && /Files others put there: yes/.test(r1), 'first: sees the folder and reads the file put there by hand');
    ok(/✓ Make this run's folder/.test(r1) && /After a new access token: yes/.test(r1), 'first: makes its run and keeps access after a new token');
    ok(/Writing into another account's folder: not tested yet/.test(r1), 'first: nothing from another account yet');
    const r2 = await run('second@example.org', false);
    ok(/by first@example\.org/.test(r2) && /Writing into another account's folder: yes/.test(r2), 'second: finds the first account\'s run, reads it and writes into it');
    ok(/✓ Move this test's folders to the bin/.test(r2) && [...g.files.values()].filter(f=> f.mimeType === 'application/vnd.google-apps.folder' && f.parents.includes('folderT')).every(f=> f.trashed), 'second, not leaving: both runs go to the bin');
  } finally {
    console.log(fails ? fails + ' FAILED' : 'ALL OK');
    await b.close(); g.close(); php.kill();
  }
})();
