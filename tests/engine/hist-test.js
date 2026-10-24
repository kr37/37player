// History (1.4.084): restoring chosen differences from an earlier version,
// and the summary each save sends.
const E = require('./engine.js');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const T=(id,name,extra)=>Object.assign({id,name,audioRev:'a',fileSize:100,duration:60},extra||{});
const PL=(id,name,order,items)=>({id,kind:'playlist',name,order,items:items.map((r,i)=>({id:id+'i'+i,kind:'track',refId:r,order:i}))});
const F=(id,name,order,children)=>({id,kind:'folder',name,order,children});
const clone=x=>JSON.parse(JSON.stringify(x));
// Then: Morning (t1,t2), Evening (t3). Since: t2 deleted from Morning and the
// library, t1 renamed, a new track t4 in a new playlist Festival, Evening renamed.
const then={format:1,tracks:[T('t1','One'),T('t2','Two'),T('t3','Three')],tree:[F('f','Daily',0,[PL('p1','Morning',0,['t1','t2']),PL('p2','Evening',1,['t3'])])]};
const now=clone(then);
now.tracks=now.tracks.filter(t=>t.id!=='t2'); now.tracks[0].name='One (new name)';
now.tree[0].children[0].items=now.tree[0].children[0].items.filter(i=>i.refId!=='t2');
now.tree[0].children[1].name='Evening sit';
now.tracks.push(T('t4','Four')); now.tree.push(PL('p3','Festival',1,['t4']));
const {rows}=E.syncReviewRows(now,now,then);
console.log(rows.map(r=>r.key+' '+r.side).join(' | '));
ok(rows.every(r=>r.side==='remote'), 'every difference is one-sided');
ok(rows.length===6, '6 differences: t1, t2, t4, Morning, Evening, Festival (' + rows.length + ')');
// Nothing chosen: unchanged
let r=E.syncRestore(now,then,new Set());
ok(E.syncEq(r.doc.tracks,now.tracks) && E.syncEq(r.doc.tree,now.tree), 'nothing chosen: the library stays as it is now');
// Restore Morning only: t2 must come back with it
r=E.syncRestore(now,then,new Set(['n:p1']));
const morning=r.doc.tree[0].children.find(n=>n.id==='p1');
ok(morning.items.length===2 && r.doc.tracks.some(t=>t.id==='t2'), 'restoring Morning brings its deleted track back too');
ok(r.keys.has('t:t2') && r.keys.has('n:p1'), 'and the needed track counts as restored');
ok(r.doc.tracks.find(t=>t.id==='t1').name==='One (new name)', 'a rename not chosen stays as now');
ok(r.doc.tree[0].children.find(n=>n.id==='p2').name==='Evening sit', 'Evening stays as now');
ok(r.doc.tree.some(n=>n.id==='p3'), 'Festival (added since) stays');
// Restore everything: back to then
r=E.syncRestore(now,then,new Set(rows.map(x=>x.key)));
ok(E.syncEq(r.doc.tracks,then.tracks), 'everything chosen: the tracks are as then');
ok(E.syncEq(r.doc.tree,then.tree), 'and the playlists too');
// Restoring after restoring: History again shows nothing left
ok(E.syncReviewRows(r.doc,r.doc,then).rows.length===0, 'restored completely: no difference left with then');
// Festival removed but a track still used elsewhere stays
const now2=clone(now); now2.tree[0].children[1].items.push({id:'x',kind:'track',refId:'t4',order:1});
r=E.syncRestore(now2,then,new Set(['n:p3','t:t4']));
ok(!r.doc.tree.some(n=>n.id==='p3') && r.doc.tracks.some(t=>t.id==='t4'), 'a track another playlist still uses stays in the library');
// Summary
const sum=E.syncChangeSummary(then,now);
console.log(JSON.stringify(sum));
ok(sum.ta===1 && sum.td===1 && sum.tc===1, 'summary: 1 track added, 1 deleted, 1 changed');
ok(sum.pa===1 && sum.pan==='Festival' && sum.pc===2, 'a new playlist named, 2 playlists changed');
ok(JSON.stringify(E.syncChangeSummary(now,now))==='{}', 'no change: an empty summary');
console.log(fails ? fails+' FAILED' : 'ALL OK');
