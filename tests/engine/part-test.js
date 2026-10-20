const E = require('./engine.js');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const T=(id,name,extra)=>Object.assign({id,name,audioRev:'a',fileSize:100,duration:60},extra||{});
const PL=(id,name,order,items)=>({id,kind:'playlist',name,order,items:items.map((r,i)=>({id:id+'i'+i,kind:'track',refId:r,order:i}))});
const F=(id,name,order,children)=>({id,kind:'folder',name,order,children});
const clone=x=>JSON.parse(JSON.stringify(x));
const names=d=>{ const out=[]; (function w(a){ a.forEach(n=>{ out.push(n.name+(n.items?'('+n.items.map(i=>i.refId).join('+')+')':'')); if(n.children) w(n.children); }); })(d.tree); return out.join(',')+' | '+d.tracks.map(t=>t.id).sort().join(','); };
// shared library: Classes{Morning(t1), Evening(t2)}, Festival(t3); library t1..t4
const shared={format:1,tracks:[T('t1','One'),T('t2','Two'),T('t3','Three'),T('t4','Four')],tree:[F('f','Classes',0,[PL('p1','Morning',0,['t1']),PL('p2','Evening',1,['t2'])]),PL('p3','Festival',1,['t3'])]};
// partial device holds Classes container + Morning + t1
const mine={format:1,tracks:[T('t1','One')],tree:[F('f','Classes',0,[PL('p1','Morning',0,['t1'])])]};
let base=clone(mine), local=clone(mine);
// 1. remote adds t5 to Morning and adds a new playlist p4; local adds own playlist p9 with t9
let remote=clone(shared); remote.tracks.push(T('t5','Five'),T('t6','Six')); remote.tree[0].children[0].items.push({id:'n1',kind:'track',refId:'t5',order:1}); remote.tree.push(PL('p4','New one',2,['t6']));
local.tracks.push(T('t9','Mine')); local.tree.push(PL('p9','My list',1,['t9']));
let r=E.syncMergePartial(base,local,remote,{deviceName:'iPad'});
console.log('local :', names(r.local)); console.log('shared:', names(r.doc));
ok(r.local.tracks.some(t=>t.id==='t5') && r.local.tree[0].children[0].items.length===2, 'new track in a held playlist arrives');
ok(!names(r.local).includes('New one') && !names(r.local).includes('Evening') && !names(r.local).includes('Festival'), 'nothing else arrives');
ok(names(r.doc).includes('My list') && r.doc.tracks.some(t=>t.id==='t9') && names(r.doc).includes('New one') && names(r.doc).includes('Evening'), 'shared keeps everything and gets this device\'s new playlist');
ok(E.syncEq(r.base, r.local), 'base = this device\'s part');
// 2. remove Morning from this device only
base=r.base; local=clone(r.local); remote=r.doc;
local.tree[0].children=local.tree[0].children.filter(n=>n.id!=='p1'); local.tracks=local.tracks.filter(t=>t.id!=='t1' && t.id!=='t5');
r=E.syncMergePartial(base,local,remote,{});
ok(names(r.doc).includes('Morning') && r.doc.tracks.some(t=>t.id==='t1'), 'removed here only: shared keeps Morning and its tracks');
ok(!names(r.local).includes('Morning') && !r.base.tree[0].children.some(n=>n.id==='p1'), 'and it leaves this device\'s scope');
// next sync with nothing changed: Morning must not come back
let r2=E.syncMergePartial(r.base, r.local, r.doc, {});
console.log('r.doc ', names(r.doc)); console.log('r2.doc', names(r2.doc)); console.log('r2.local', names(r2.local)); ok(!names(r2.local).includes('Morning') && E.syncEq(r2.doc, r.doc), 'stays gone, nothing sent');
// 3. delete My list everywhere
base=r.base; local=clone(r.local); remote=r.doc;
local.tree=local.tree.filter(n=>n.id!=='p9');
r=E.syncMergePartial(base,local,remote,{deleteEverywhere:new Set(['p9'])});
console.log('del base', names(base)); console.log('del local', names(local)); console.log('del doc', names(r.doc));
ok(!names(r.doc).includes('My list'), 'deleted everywhere: gone from shared');
// 4. review classification
const {rows, maps}=E.syncReviewRows(r.base, r.local, r.doc);
E.syncClassifyPartial(rows, maps, new Set());
const lower=rows.filter(x=>x.lower).map(x=>x.key).sort();
console.log('lower:', lower.join(' '), ' upper:', rows.filter(x=>!x.lower).map(x=>x.key).join(' '));
ok(rows.every(x=>x.lower), 'all differences are things this device doesn\'t have');
const ch={}; rows.forEach(x=>ch[x.key]=E.syncDefaultChoice(x));
ok(Object.values(ch).every(c=>c==='skip'), 'they default to Skip');
// take Evening: its track and nothing else comes; folder already held
ch['n:p2']='take'; E.syncApplyDependencies(rows, ch);
ok(ch['t:t2']==='take', 'taking Evening brings its track');
const ap=E.syncApplyReview(r.base, r.local, r.doc, ch);
console.log('after take:', names(ap.local));
ok(names(ap.local).includes('Evening(t2)') && !names(ap.local).includes('Festival') && E.syncEq(ap.base, ap.local), 'Evening taken, base follows');
// taking a playlist in a folder not held brings the folder as a container
const sh2=clone(ap.local); sh2.tree.push(F('g','Retreat',5,[PL('q1','Day 1',0,['t3']),PL('q2','Day 2',1,['t4'])]));
const bigShared=clone(r.doc); bigShared.tree.push(F('g','Retreat',5,[PL('q1','Day 1',0,['t3']),PL('q2','Day 2',1,['t4'])]));
const rows3=E.syncReviewRows(ap.base, ap.local, bigShared); E.syncClassifyPartial(rows3.rows, rows3.maps, new Set());
const ch3={}; rows3.rows.forEach(x=>ch3[x.key]=E.syncDefaultChoice(x)); ch3['n:q1']='take'; E.syncApplyDependencies(rows3.rows, ch3);
ok(ch3['n:g']==='take' && ch3['n:q2']==='skip', 'container folder comes, its other playlist doesn\'t');
const ap3=E.syncApplyReview(ap.base, ap.local, bigShared, ch3);
console.log('after q1:', names(ap3.local));
ok(names(ap3.local).includes('Retreat,Day 1(t3)') && !names(ap3.local).includes('Day 2'), 'Day 1 inside Retreat, Day 2 not');
// removedHere row in review defaults to drop, or send when marked
const l5=clone(ap3.local); l5.tree=l5.tree.filter(n=>n.id!=='g'); l5.tree.forEach(n=>{ if(n.children) n.children=n.children.filter(c=>c.id!=='q1'); });
const rows5=E.syncReviewRows(ap3.base, l5, bigShared); E.syncClassifyPartial(rows5.rows, rows5.maps, new Set(['q1']));
const d5={}; rows5.rows.forEach(x=>d5[x.key]=E.syncDefaultChoice(x));
console.log('removed rows:', rows5.rows.filter(x=>x.removedHere).map(x=>x.key+'='+d5[x.key]).join(' '));
ok(d5['n:g']==='drop' && d5['n:q1']==='send', 'removed here: drop by default, send when deleted everywhere');
console.log(fails? fails+' FAILED':'ALL OK');
