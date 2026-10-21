// A fake Google, for tests only: just enough of Drive API v3, the OAuth
// sign-in page and the token endpoint for 37 Player's Google Drive libraries.
//   const g = require('./fake-google'); const srv = g.start(8872);
//   srv.files (Map), srv.expireAccess(), srv.revokeRefresh()
const http = require('http'), url = require('url'), crypto = require('crypto');
function start(port){
  const files = new Map(); let seq = 0;
  const access = new Set(), refresh = new Set(); let tokSeq = 0;
  const sessions = new Map();
  const newId = ()=> 'f' + (++seq).toString(36) + crypto.randomBytes(3).toString('hex');
  const now = ()=> new Date(Date.now() + seq).toISOString(); // distinct, increasing
  const meta = (f, fields)=>{ const o = {id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, appProperties: f.appProperties, createdTime: f.createdTime, modifiedTime: f.modifiedTime, size: f.data ? String(f.data.length) : undefined, trashed: f.trashed}; return o; };
  function matches(f, q){
    if(!q) return true;
    const ok = [];
    q.replace(/'((?:[^'\\]|\\.)*)' in parents/g, (_, id)=>{ ok.push((f.parents || []).includes(id)); return ''; });
    if(/trashed=false/.test(q)) ok.push(!f.trashed);
    const nm = q.match(/name='((?:[^'\\]|\\.)*)'/); if(nm) ok.push(f.name === nm[1].replace(/\\(.)/g, '$1'));
    const nc = q.match(/name contains '((?:[^'\\]|\\.)*)'/); if(nc) ok.push(f.name.startsWith(nc[1]));
    const mt = q.match(/mimeType='([^']*)'/); if(mt) ok.push(f.mimeType === mt[1]);
    const ap = q.match(/appProperties has \{ key='([^']*)' and value='([^']*)' \}/); if(ap) ok.push(!!f.appProperties && f.appProperties[ap[1]] === ap[2]);
    return ok.every(Boolean);
  }
  const body = req=> new Promise(r=>{ const c = []; req.on('data', d=> c.push(d)); req.on('end', ()=> r(Buffer.concat(c))); });
  const send = (res, code, obj, headers)=>{ res.writeHead(code, Object.assign({'Content-Type': 'application/json'}, headers || {})); res.end(obj === undefined ? '' : typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj)); };
  const create = (m, data)=>{ const f = {id: newId(), name: m.name, mimeType: m.mimeType || 'application/octet-stream', parents: m.parents || [], appProperties: m.appProperties, createdTime: now(), modifiedTime: now(), data: data || null, trashed: false}; files.set(f.id, f); return f; };
  const srv = http.createServer(async (req, res)=>{
    const u = url.parse(req.url, true), p = u.pathname, q = u.query;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Content-Range, X-Upload-Content-Type, X-Upload-Content-Length, Range');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Location, Range, Content-Range');
    if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
    // ---- OAuth (no Authorization)
    if(p === '/o/oauth2/v2/auth'){ res.writeHead(302, {Location: q.redirect_uri + '?code=CODE' + (++tokSeq) + '&state=' + encodeURIComponent(q.state)}); return res.end(); }
    if(p === '/token' && req.method === 'POST'){
      const form = new URLSearchParams((await body(req)).toString());
      if(form.get('client_secret') !== 'test-secret') return send(res, 401, {error: 'invalid_client'});
      if(form.get('grant_type') === 'authorization_code'){ const a = 'acc' + (++tokSeq), r = 'ref' + tokSeq; access.add(a); refresh.add(r); return send(res, 200, {access_token: a, refresh_token: r, expires_in: 3600}); }
      if(form.get('grant_type') === 'refresh_token'){ if(!refresh.has(form.get('refresh_token'))) return send(res, 400, {error: 'invalid_grant'}); const a = 'acc' + (++tokSeq); access.add(a); return send(res, 200, {access_token: a, expires_in: 3600}); }
      return send(res, 400, {error: 'unsupported_grant_type'});
    }
    // ---- Drive (Bearer token)
    const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
    if(!access.has(tok)) return send(res, 401, {error: {code: 401, message: 'Invalid Credentials'}});
    srv.calls.push(req.method + ' ' + p);
    if(p === '/drive/v3/files' && req.method === 'GET'){
      let list = [...files.values()].filter(f=> matches(f, q.q));
      if(/name desc/.test(q.orderBy || '')) list.sort((a, b)=> a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
      const start = parseInt(q.pageToken || '0', 10), size = Math.min(parseInt(q.pageSize || '100', 10), 1000);
      const page = list.slice(start, start + size);
      return send(res, 200, Object.assign({files: page.map(f=> meta(f))}, start + size < list.length ? {nextPageToken: String(start + size)} : {}));
    }
    if(p === '/drive/v3/files' && req.method === 'POST'){ const m = JSON.parse((await body(req)).toString() || '{}'); return send(res, 200, meta(create(m))); }
    let m = p.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if(m){
      const f = files.get(decodeURIComponent(m[1]));
      if(!f) return send(res, 404, {error: {code: 404, message: 'File not found'}});
      if(req.method === 'DELETE'){ files.delete(f.id); return send(res, 204); }
      if(req.method === 'PATCH'){ const b = JSON.parse((await body(req)).toString() || '{}'); if(b.appProperties) f.appProperties = Object.assign({}, f.appProperties, b.appProperties); if(b.name) f.name = b.name; return send(res, 200, meta(f)); }
      if(q.alt === 'media'){
        const data = f.data || Buffer.alloc(0), r = (req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
        if(r){ const s = r[1] === '' ? data.length - parseInt(r[2], 10) : parseInt(r[1], 10), e = r[2] === '' || r[1] === '' ? data.length - 1 : Math.min(parseInt(r[2], 10), data.length - 1);
          return send(res, 206, data.slice(s, e + 1), {'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${s}-${e}/${data.length}`}); }
        return send(res, 200, data, {'Content-Type': 'application/octet-stream'});
      }
      return send(res, 200, meta(f));
    }
    if(p === '/upload/drive/v3/files' && req.method === 'POST' && q.uploadType === 'multipart'){
      const b = await body(req), boundary = (req.headers['content-type'] || '').match(/boundary=(.+)$/)[1];
      const parts = []; let i = 0; const sep = Buffer.from('--' + boundary);
      while((i = b.indexOf(sep, i)) >= 0){ const j = b.indexOf(sep, i + sep.length); if(j < 0) break; parts.push(b.slice(i + sep.length, j)); i = j; }
      const body2 = x=>{ const k = x.indexOf('\r\n\r\n'); return x.slice(k + 4, x.length - 2); };
      const md = JSON.parse(body2(parts[0]).toString()), data = body2(parts[1]);
      srv.uploads.push({kind: 'multipart', name: md.name, size: data.length});
      return send(res, 200, meta(create(md, data)));
    }
    if(p === '/upload/drive/v3/files' && req.method === 'POST' && q.uploadType === 'resumable'){
      const md = JSON.parse((await body(req)).toString()), id = 'up' + (++seq);
      sessions.set(id, {md, total: parseInt(req.headers['x-upload-content-length'], 10), chunks: [], got: 0});
      res.writeHead(200, {Location: `http://127.0.0.1:${port}/upload/drive/v3/files?uploadType=resumable&upload_id=${id}`}); return res.end();
    }
    if(p === '/upload/drive/v3/files' && req.method === 'PUT' && q.upload_id){
      const s = sessions.get(q.upload_id), b = await body(req);
      if(!s) return send(res, 404, {error: 'no session'});
      const cr = (req.headers['content-range'] || '').match(/bytes (\d+)-(\d+)\/(\d+)|bytes \*\/(\d+)/);
      if(cr && cr[1] !== undefined){ if(parseInt(cr[1], 10) !== s.got) return send(res, 400, {error: 'bad offset'}); s.chunks.push(b); s.got += b.length; srv.uploads.push({kind: 'chunk', name: s.md.name, size: b.length}); }
      if(s.got >= s.total){ const f = create(s.md, Buffer.concat(s.chunks)); sessions.delete(q.upload_id); return send(res, 200, meta(f)); }
      res.writeHead(308, s.got ? {Range: `bytes=0-${s.got - 1}`} : {}); return res.end();
    }
    m = p.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if(m && req.method === 'PATCH'){ const f = files.get(decodeURIComponent(m[1])); if(!f) return send(res, 404, {}); f.data = await body(req); return send(res, 200, meta(f)); }
    send(res, 400, {error: 'fake-google: unknown ' + req.method + ' ' + p});
  });
  srv.files = files; srv.calls = []; srv.uploads = [];
  srv.expireAccess = ()=> access.clear();
  srv.revokeRefresh = ()=>{ refresh.clear(); access.clear(); };
  srv.listen(port, '127.0.0.1');
  return srv;
}
module.exports = {start};
