const E = require('./engine.js');
let fails=0; const ok=(c,m)=>{ console.log((c?'ok   ':'FAIL ')+m); if(!c) fails++; };
const T=(id)=>({id,name:id,audioRev:'a'}); const PL=(id,order)=>({id,kind:'playlist',name:id,order,items:[]});
const F=(id,order,children)=>({id,kind:'folder',name:id,order,children});
const clone=x=>JSON.parse(JSON.stringify(x));
const shared={format:1,tracks:[],tree:[F('Classes',0,[PL('p1',0),PL('p5',1),PL('p2',2)])]};
const base={format:1,tracks:[],tree:[F('Classes',0,[PL('p1',0),PL('p2',1)])]};
const local=clone(base); local.tree[0].children[0].order=1; local.tree[0].children[1].order=0;
let r=E.syncMergePartial(base,local,shared,{});
const ord=d=>d.tree[0].children.map(n=>n.id).join(',');
console.log('shared', ord(r.doc), 'local', ord(r.local));
ok(ord(r.doc)==='p2,p5,p1' && ord(r.local)==='p2,p1', 'reorder here moves within the positions they hold');
let r2=E.syncMergePartial(r.base,r.local,r.doc,{});
ok(E.syncEq(r2.doc,r.doc) && E.syncEq(r2.local,r.local), 'stable on the next sync');
// unchanged local, shared reorders: local follows
const sh2=clone(r.doc); sh2.tree[0].children.forEach(n=>{ if(n.id==='p1') n.order=-1; });
let r3=E.syncMergePartial(r2.base,r2.local,sh2,{});
console.log('after shared reorder: local', ord(r3.local));
ok(ord(r3.local)==='p1,p2', 'shared reorder reaches this device');
// full merge: delete while sibling order changed elsewhere
const b={format:1,tracks:[],tree:[PL('a',0),PL('b',1),PL('c',2)]};
const l=clone(b); l.tree=l.tree.filter(n=>n.id!=='c');
const rm=clone(b); rm.tree.unshift(PL('new',0)); rm.tree.forEach((n,i)=>n.order=i);
const m=E.syncMerge(b,l,rm,{}).doc;
ok(!m.tree.some(n=>n.id==='c'), 'full sync: a deletion survives siblings moving elsewhere: '+m.tree.map(n=>n.id).join(','));
console.log(fails? fails+' FAILED':'ALL OK');
