const puppeteer = require('puppeteer-core'); const sleep = ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
  const b = await puppeteer.launch({executablePath: process.env.CHROME || '/usr/bin/google-chrome', args:['--no-sandbox']});
  const p = await b.newPage(); p.on('pageerror', e=>console.log('PAGE ERROR:', e.message));
  await p.setViewport({width:1180,height:820,isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await p.goto('http://localhost:8861/37-player.html',{waitUntil:'networkidle0'}); await sleep(1000);
  for(let i=0;i<4;i++){ await p.evaluate(()=>{ const m=document.querySelector('.modal'); if(!m) return; const b=[...m.querySelectorAll('button')].find(b=>/English|Start a library|Skip|Finish|Close|OK|Not now/.test(b.textContent)) || m.querySelector('[data-close]'); b && b.click(); }); await sleep(300); }
  // library: Classes folder with two playlists, a second folder "Retreat" empty; tracks
  await p.evaluate(async()=>{
    const r = window.__dbg.getRoot();
    const mk = (id,name)=>({id, name, album:'A', artist:'X', duration:60, peaks:[]});
    r.library = [mk('t1','Alpha'), mk('t2','Bravo'), mk('t3','Charlie')];
    r.tree = [
      {id:'fC', kind:'folder', name:'Classes', order:0, children:[
        {id:'p1', kind:'playlist', name:'Morning', order:0, items:[{id:'i1',kind:'track',refId:'t1',order:0},{id:'i2',kind:'track',refId:'t2',order:1},{id:'i3',kind:'track',refId:'t3',order:2}]},
        {id:'p2', kind:'playlist', name:'Evening', order:1, items:[]}]},
      {id:'fR', kind:'folder', name:'Retreat', order:1, children:[]},
      {id:'p3', kind:'playlist', name:'Loose playlist', order:2, items:[{id:'j1',kind:'track',refId:'t3',order:0}]}];
    delete r.settings.starterPlaylistId; await window.__dbg.saveState(); });
  await p.reload({waitUntil:'networkidle0'}); await sleep(1200);
  for(let i=0;i<4;i++){ await p.evaluate(()=>{ const m=document.querySelector('.modal'); if(!m) return; const b=[...m.querySelectorAll('button')].find(b=>/English|Start a library|Skip|Finish|Close|OK|Not now/.test(b.textContent)) || m.querySelector('[data-close]'); b && b.click(); }); await sleep(300); }
  await p.evaluate(()=>{ [...document.querySelectorAll('.mode-tab')].find(b=>/Edit Playlists/.test(b.textContent))?.click(); }); await sleep(800);
  for(let i=0;i<3;i++){ await p.evaluate(()=>{ const m=document.querySelector('.modal'); if(!m) return; const b=[...m.querySelectorAll('button')].find(b=>/Unlock|Edit|OK|Continue/.test(b.textContent)) || m.querySelector('[data-close]'); b && b.click(); }); await sleep(300); }
  const center = sel => p.evaluate((sel)=>{ const el = typeof sel==='string' ? document.querySelector(sel) : null; if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }, sel);
  const rowByText = (col, cls, txt)=> p.evaluate((col,cls,txt)=>{ const el=[...document.querySelectorAll('#'+col+' '+cls)].find(e=>e.textContent.includes(txt)); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+Math.min(80,r.width/2), y:r.top+r.height/2, top:r.top}; }, col, cls, txt);
  const tap = async (pt)=>{ await p.touchscreen.tap(pt.x, pt.y); await sleep(350); };
  const longDrag = async (from, to)=>{ await p.touchscreen.touchStart(from.x, from.y); await sleep(650); const steps=8; for(let i=1;i<=steps;i++){ await p.touchscreen.touchMove(from.x+(to.x-from.x)*i/steps, from.y+(to.y-from.y)*i/steps); await sleep(40); } await sleep(200); await p.touchscreen.touchEnd(); await sleep(600); };
  console.log('unlocked:', await p.evaluate(()=> document.body.className));
  // 1. one tap opens a folder and shows its icons
  let pt = await rowByText('editorColA','.folder-head','Classes');
  await tap(pt);
  const f1 = await p.evaluate(()=>{ const h=[...document.querySelectorAll('#editorColA .folder-head')].find(e=>e.textContent.includes('Classes')); return {open:h.classList.contains('open'), actions:getComputedStyle(h.querySelector('.row-actions')).display}; });
  ok(f1.open && f1.actions==='flex', 'one tap opens the folder and shows its icons: '+JSON.stringify(f1));
  // hovering an unselected track row shows no icons
  pt = await rowByText('editorColA','.playlist-row','Morning'); await tap(pt);
  await p.screenshot({path:'shots/ipad-1.png'});
  pt = await rowByText('editorColB','.item-row','Bravo'); await tap(pt);
  const sel = await p.evaluate(()=>{ const rows=[...document.querySelectorAll('#editorColB .item-row')]; return rows.map(r=>[r.textContent.replace(/\s+/g,' ').trim().slice(0,12), r.classList.contains('selected'), getComputedStyle(r.querySelector('.item-row-actions')).display]); });
  console.log('B rows:', JSON.stringify(sel));
  ok(sel.find(r=>r[0].includes('Bravo'))[1], 'one tap selects a track in B');
  // 2. long-press the selected row and drag it above Alpha
  const from = await rowByText('editorColB','.item-row','Bravo'), to = await rowByText('editorColB','.item-row','Alpha');
  await longDrag(from, {x: to.x, y: to.y - 6});
  const order = await p.evaluate(()=> [...document.querySelectorAll('#editorColB .item-row .tn')].map(e=>e.textContent));
  ok(order[0]==='Bravo', 'dragged a track to the top: '+order.join(','));
  // 3. drag the "Loose playlist" into the Retreat folder
  const lp = await rowByText('editorColA','.playlist-row','Loose playlist'), rf = await rowByText('editorColA','.folder-head','Retreat');
  await longDrag(lp, rf);
  const tree = await p.evaluate(()=>{ const r=window.__dbg.getRoot(); const f=r.tree.find(n=>n.id==='fR'); return {inRetreat: (f.children||[]).map(c=>c.name), top: r.tree.map(n=>n.name)}; });
  ok(tree.inRetreat.includes('Loose playlist'), 'dragged a playlist into a folder: '+JSON.stringify(tree));
  // 4. drag the Retreat folder above Classes
  const rf2 = await rowByText('editorColA','.folder-head','Retreat'), cl = await rowByText('editorColA','.folder-head','Classes');
  await longDrag(rf2, {x: cl.x, y: cl.top + 3});
  const top2 = await p.evaluate(()=> window.__dbg.getRoot().tree.slice().sort((a,b)=>a.order-b.order).map(n=>n.name));
  ok(top2[0]==='Retreat', 'dragged a folder above another: '+top2.join(','));

  // 5. D -> B: choose a playlist in C, tap a track in D, long-press it and drag into B
  const cF = await rowByText('editorColCWrap','.folder-head','Classes'); if(cF) await tap(cF);
  const cRow = await rowByText('editorColCWrap','.playlist-row','Morning');
  console.log('C row:', JSON.stringify(cRow));
  if(cRow){ await tap(cRow); }
  const dRow = await rowByText('editorColD','.item-row','Charlie');
  console.log('D row:', JSON.stringify(dRow));
  if(dRow){
    await tap(dRow);
    console.log('D sel:', await p.evaluate(()=>[...document.querySelectorAll('#editorColD .item-row')].map(r=>r.textContent.slice(0,14)+':'+r.classList.contains('selected')).join(' | ')));
    await p.screenshot({path:'shots/ipad-d.png'});
    const bLast = await p.evaluate(()=>{ const rows=[...document.querySelectorAll('#editorColB .item-row')]; const r=rows[rows.length-1].getBoundingClientRect(); return {x:r.left+60, y:r.bottom+20}; });
    const n0 = await p.evaluate(()=> document.querySelectorAll('#editorColB .item-row').length);
    p.on('console', m=>{ if(m.text().startsWith('DBG')) console.log(m.text()); });
    await p.evaluate(()=>{ document.addEventListener('touchstart', e=>{ console.log('DBG start', e.target.className, e.target.closest('.item-row')?.dataset.id, e.target.closest('[id^=editorCol]')?.id); setTimeout(()=>console.log('DBG after', !!document.querySelector('.touch-drag-ghost'), [...document.querySelectorAll('#editorColD .item-row')].map(r=>r.className).join('|')), 600); }, true); document.addEventListener('touchmove', e=>{ const t=e.touches[0]; const el=document.elementFromPoint(t.clientX,t.clientY); console.log('DBG move', Math.round(t.clientX), Math.round(t.clientY), el && (el.id||el.className), !!document.querySelector('.touch-drag-ghost')); }, true); });
    const dRow2 = await rowByText('editorColD','.item-row','Charlie');
    await longDrag(dRow2, bLast);
    const n1 = await p.evaluate(()=> document.querySelectorAll('#editorColB .item-row').length);
    ok(n1===n0+1, 'dragged a track from D into B: '+n0+' -> '+n1);
  } else ok(false,'no D row');
  // 6. resize column A with a finger
  const h = await p.evaluate(()=>{ const a=document.getElementById('editorColA'); const hd=a.nextElementSibling; const r=hd.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+200, w:a.getBoundingClientRect().width, cls: hd.className}; });
  await p.touchscreen.touchStart(h.x+6, h.y); for(let i=1;i<=6;i++){ await p.touchscreen.touchMove(h.x+6+i*15, h.y); await sleep(30); } await p.touchscreen.touchEnd(); await sleep(400);
  const w2 = await p.evaluate(()=> document.getElementById('editorColA').getBoundingClientRect().width);
  ok(w2 > h.w + 50, 'column A widened by finger: '+h.w+' -> '+w2+' ('+h.cls+')');
  // wrap names on, look at a selected playlist in a narrow A
  await p.evaluate(()=>{ document.body.classList.add('wrap-names'); document.getElementById('editorColA').style.flex='0 0 150px'; document.getElementById('editorColA').style.width='150px'; const r=window.__dbg.getRoot(); r.tree.find(n=>n.id==='fC').children[0].name='Morning meditation with the longer title'; window.__dbg.saveState(); });
  await sleep(300); await p.evaluate(()=>{ [...document.querySelectorAll('.mode-tab')].find(b=>/Library/.test(b.textContent))?.click(); }); await sleep(300); await p.evaluate(()=>{ [...document.querySelectorAll('.mode-tab')].find(b=>/Edit Playlists/.test(b.textContent))?.click(); }); await sleep(600);
  await p.screenshot({path:'shots/ipad-3.png'});
  await p.screenshot({path:'shots/ipad-2.png'});
  console.log(fails ? fails+' FAILED' : 'ALL OK');
  await b.close();
})();
