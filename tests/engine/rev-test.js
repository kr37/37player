const E = require('./engine.js');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const T=(id,name,extra)=>Object.assign({id,name,audioRev:'a',fileSize:100,duration:60},extra||{});
const PL=(id,name,order,items)=>({id,kind:'playlist',name,order,items:items.map((r,i)=>({id:id+'i'+i,kind:'track',refId:r,order:i}))});
const F=(id,name,order,children)=>({id,kind:'folder',name,order,children});
const clone=x=>JSON.parse(JSON.stringify(x));
const base={format:1,tracks:[T('t1','One'),T('t2','Two')],tree:[F('f','Classes',0,[PL('p1','Morning',0,['t1']),PL('p2','Evening',1,['t2'])])]};
// local: rename Morning, add new track t3 into Evening; remote: add t4 + new playlist p3 using it, delete t2? no — reorder folder: Evening before Morning
const local=clone(base); local.tree[0].children[0].name='Morning sit'; local.tracks.push(T('t3','Three')); local.tree[0].children[1].items.push({id:'x',kind:'track',refId:'t3',order:1});
const remote=clone(base); remote.tracks.push(T('t4','Four')); remote.tree.push(PL('p3','Festival',1,['t4'])); remote.tree[0].children[0].order=1; remote.tree[0].children[1].order=0;
const {rows}=E.syncReviewRows(base,local,remote);
console.log(rows.map(r=>r.key+' '+r.side).join(' | '));
ok(rows.length===6, '6 rows (t3,t4,p1,p2,p3, order of f)');
const choices={}; rows.forEach(r=>choices[r.key]=E.syncDefaultChoice(r));
const needs=E.syncApplyDependencies(rows,choices);
ok(needs.get('t3') && needs.get('t3')[0]==='Evening', 't3 needed by Evening');
// apply defaults
let res=E.syncApplyReview(base,local,remote,choices);
const names=d=>JSON.stringify(d.tree.map(n=>n.name+(n.children?'['+n.children.map(c=>c.name+'('+(c.items||[]).length+')').join(',')+']':'')));
console.log('shared', names(res.shared)); console.log('local ', names(res.local)); console.log('base  ', names(res.base));
ok(E.syncEq(res.shared,res.local), 'defaults: shared and local end up the same');
ok(E.syncEq(res.base,res.shared), 'defaults: base equals both');
ok(names(res.shared)==='["Classes[Evening(2),Morning sit(1)]","Festival"]', 'content right');
ok(E.syncReviewRows(res.base,res.local,res.shared).rows.length===0, 'nothing left to review');
// skip the remote Festival playlist (and so its track can be skipped)
const c2={}; rows.forEach(r=>c2[r.key]=E.syncDefaultChoice(r)); c2['n:p3']='skip'; c2['t:t4']='skip'; E.syncApplyDependencies(rows,c2);
res=E.syncApplyReview(base,local,remote,c2);
ok(!res.local.tree.some(n=>n.name==='Festival') && res.shared.tree.some(n=>n.name==='Festival'), 'skipped: Festival stays only in the shared library');
const again=E.syncReviewRows(res.base,res.local,res.shared).rows;
console.log('again:', again.map(r=>r.key+' '+r.side).join(' | '));
ok(again.length===2 && again.every(r=>r.side==='remote'), 'skipped rows come back next time as remote changes');
// skip a local new track while its playlist is sent -> forced back to send
const c3={}; rows.forEach(r=>c3[r.key]=E.syncDefaultChoice(r)); c3['t:t3']='skip'; E.syncApplyDependencies(rows,c3);
ok(c3['t:t3']==='send', 'a track a sent playlist needs is forced to send');
// conflict: both rename Evening
const l2=clone(base); l2.tree[0].children[1].name='Evening A'; const r2=clone(base); r2.tree[0].children[1].name='Evening B';
const rows2=E.syncReviewRows(base,l2,r2).rows;
ok(rows2.length===1 && rows2[0].side==='both' && E.syncDefaultChoice(rows2[0])===null, 'both renamed: a conflict waiting for a choice');
res=E.syncApplyReview(base,l2,r2,{[rows2[0].key]:'take'});
ok(res.local.tree[0].children[1].name==='Evening B' && E.syncEq(res.local,res.shared), 'take theirs on a conflict');
// remote deletes a track the local playlist still uses after send
const l3=clone(base); l3.tree[0].children[0].items.push({id:'y',kind:'track',refId:'t2',order:1});
const r3=clone(base); r3.tracks=r3.tracks.filter(t=>t.id!=='t2'); r3.tree[0].children[1].items=[];
const rows3=E.syncReviewRows(base,l3,r3).rows; const c4={}; rows3.forEach(r=>c4[r.key]=E.syncDefaultChoice(r)); E.syncApplyDependencies(rows3,c4);
console.log('rows3', rows3.map(r=>r.key+' '+r.side+' '+c4[r.key]).join(' | '));
res=E.syncApplyReview(base,l3,r3,c4);
ok(res.shared.tracks.some(t=>t.id==='t2') && res.local.tracks.some(t=>t.id==='t2'), 'a track still used stays');
console.log(fails? fails+' FAILED':'ALL OK');
