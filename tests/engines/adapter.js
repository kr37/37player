// A Puppeteer-shaped wrapper over Playwright, as much of it as the tests use,
// so the same test files run in WebKit (Safari's engine) and Firefox. See hook.js.
const pw = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const ENGINE = process.env.ENGINE;

// Puppeteer's evaluate takes any number of arguments; Playwright's one. So
// the call is built here, in Node, as a function whose source holds the
// test's function and its arguments (as JSON); Playwright sends a function's
// source to the page, as Puppeteer does, so no eval runs in the page.
const asFn = (fn, args)=> new Function('return (' + fn.toString() + ')(...' + JSON.stringify(args) + ');');
const asFnOn = (fn, args)=> new Function('el', 'return (' + fn.toString() + ')(el, ...' + JSON.stringify(args) + ');');

class Element {
  constructor(h){ this.h = h; }
  click(o){ return this.h.click(o); }
  screenshot(o){ return this.h.screenshot(o); }
  evaluate(fn, ...args){ return this.h.evaluate(asFnOn(fn, args)); }
  type(t, o){ return this.h.type(t, o); }
  focus(){ return this.h.focus(); }
  boundingBox(){ return this.h.boundingBox(); }
  uploadFile(...files){ return this.h.setInputFiles(files); }
  hover(o){ return this.h.hover(o); }
  $(sel){ return this.h.$(sel).then(x=> x && new Element(x)); }
  dispose(){ return this.h.dispose(); }
}

// Only web addresses are routed: in WebKit a route on everything also caught
// the page's own blob: addresses, and the player's audio failed with
// "Blocked by Web Inspector" (play, dbl, table, e2e in WebKit).
const webOnly = (u)=> u.protocol === 'http:' || u.protocol === 'https:';
class Page {
  constructor(p, ctx){ this.p = p; this.ctx = ctx; this.keyboard = p.keyboard; this.mouse = new Mouse(p.mouse); this.intercept = false; this.requestHandlers = []; }
  goto(url, o){ return this.p.goto(url, waitOpts(o)); }
  reload(o){ return this.p.reload(waitOpts(o)); }
  url(){ return this.p.url(); }
  content(){ return this.p.content(); }
  title(){ return this.p.title(); }
  evaluate(fn, ...args){ return typeof fn === 'string' ? this.p.evaluate(fn) : this.p.evaluate(asFn(fn, args)); }
  evaluateHandle(fn, ...args){ return this.p.evaluateHandle(asFn(fn, args)); }
  evaluateOnNewDocument(fn, ...args){ return this.p.addInitScript(typeof fn === 'string' ? fn : `(${fn.toString()})(...${JSON.stringify(args)})`); }
  waitForFunction(fn, o, ...args){ return this.p.waitForFunction(typeof fn === 'string' ? fn : asFn(fn, args), undefined, o); }
  waitForSelector(sel, o){ return this.p.waitForSelector(sel, o).then(x=> x && new Element(x)); }
  // A navigation still to come, as Puppeteer's (waitForLoadState answered at
  // once for the page already loaded: drive's sign-in round trip).
  waitForNavigation(o){ return this.p.waitForNavigation(waitOpts(o)); }
  setViewport(v){ return this.p.setViewportSize({width: v.width, height: v.height}); }
  screenshot(o){ return this.p.screenshot(o); }
  $(sel){ return this.p.$(sel).then(x=> x && new Element(x)); }
  $$(sel){ return this.p.$$(sel).then(xs=> xs.map(x=> new Element(x))); }
  // A double click as Puppeteer gives it: a dblclick event too.
  click(sel, o){ return o && o.clickCount === 2 ? this.p.dblclick(sel, {...o, clickCount: undefined}) : this.p.click(sel, o); }
  hover(sel){ return this.p.hover(sel); }
  select(sel, ...values){ return this.p.selectOption(sel, values); }
  $eval(sel, fn, ...args){ return this.p.$eval(sel, asFnOn(fn, args)); }
  $$eval(sel, fn, ...args){ return this.p.$$eval(sel, asFnOn(fn, args)); }
  type(sel, t, o){ return this.p.type(sel, t, o); }
  focus(sel){ return this.p.focus(sel); }
  bringToFront(){ return this.p.bringToFront(); }
  // A persistent context ends with its last page: a test that closes its
  // page and opens another in the same context (as a person reopening 37
  // Player) gets a fresh blank page kept ready first.
  async close(){
    if(!this.ctx.spare && this.ctx.c.pages().filter(x=> x !== this.p && !x.isClosed()).length === 0) this.ctx.spare = await this.ctx.c.newPage().catch(()=> null);
    return this.p.close();
  }
  browserContext(){ return this.ctx; }
  // Puppeteer changes the page's user agent; here the page's navigator says
  // it (from the next load on), and requests carry it.
  async setUserAgent(ua){
    await this.p.setExtraHTTPHeaders({'User-Agent': ua});
    await this.p.addInitScript((ua)=>{ Object.defineProperty(Navigator.prototype, 'userAgent', {get: ()=> ua, configurable: true});
      const v = (ua.match(/^Mozilla\/5\.0 \((.*)$/) || [])[1]; if(v) Object.defineProperty(Navigator.prototype, 'appVersion', {get: ()=> '5.0 (' + v, configurable: true});
      const pf = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Macintosh/.test(ua) ? 'MacIntel' : /Windows/.test(ua) ? 'Win32' : /Android|Linux/.test(ua) ? 'Linux armv8l' : null;
      if(pf) Object.defineProperty(Navigator.prototype, 'platform', {get: ()=> pf, configurable: true});
      if(/iPad|iPhone|Macintosh/.test(ua)) Object.defineProperty(Navigator.prototype, 'vendor', {get: ()=> 'Apple Computer, Inc.', configurable: true}); }, ua);
  }
  // Puppeteer's emulate: the viewport, the user agent, and (Playwright sets
  // touch only when a context is made) a touch screen as the page sees it:
  // a coarse pointer, no hover, touch points. Touch events themselves stay
  // Chrome's (ipad, phonecols are skipped).
  async emulate(d){
    if(!d) return;
    if(d.viewport) await this.setViewport(d.viewport);
    if(d.userAgent) await this.setUserAgent(d.userAgent);
    if(d.viewport && (d.viewport.hasTouch || d.viewport.isMobile)) await this.p.addInitScript(()=>{
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q)=>{
        const m = mm(q), s = String(q).replace(/\s+/g, '');
        const forced = /\(pointer:coarse\)|\(any-pointer:coarse\)|\(hover:none\)|\(any-hover:none\)/.test(s) ? true : /\(pointer:fine\)|\(any-pointer:fine\)|\(hover:hover\)|\(any-hover:hover\)/.test(s) ? false : null;
        if(forced === null) return m;
        return {matches: forced, media: m.media, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; }};
      };
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', {get: ()=> 5, configurable: true});
      if(!('ontouchstart' in window)) window.ontouchstart = null;
    });
  }
  // Puppeteer's request interception, on Playwright's routes.
  async setRequestInterception(on){
    this.intercept = on;
    if(on && !this.routed){
      this.routed = true;
      await this.p.route(webOnly, (route)=>{
        const req = route.request();
        let settled = false;
        // Settled once: a handler may answer later (a held or delayed
        // request), as in Puppeteer, so nothing here answers for it.
        const once = (f)=> settled ? Promise.resolve() : (settled = true, f().catch(()=>{}));
        const r = {
          url: ()=> req.url(), method: ()=> req.method(), headers: ()=> req.headers(), resourceType: ()=> req.resourceType(),
          isInterceptResolutionHandled: ()=> settled,
          respond: (x)=> once(()=> route.fulfill({status: x.status || 200, contentType: x.contentType, headers: x.headers, body: x.body})),
          continue: ()=> once(()=> route.fallback()),
          abort: ()=> once(()=> route.abort()),
        };
        if(!this.intercept || !this.requestHandlers.length) return route.fallback();
        for(const h of this.requestHandlers) h(r);
      });
    }
  }
  on(ev, fn){
    if(ev === 'request'){ this.requestHandlers.push(fn); return this; }
    this.p.on(ev, fn); return this;
  }
  off(ev, fn){ if(ev === 'request') this.requestHandlers = this.requestHandlers.filter(f=> f !== fn); else this.p.off(ev, fn); return this; }
  removeAllListeners(ev){ if(!ev || ev === 'request') this.requestHandlers = []; if(ev) this.p.removeAllListeners(ev); return this; }
  // Chrome's network throttling, roughly: each request waits its latency,
  // and one carrying a body waits as long as sending it would take at the
  // upload speed (e2e's slow laptop: files still on their way when another
  // device joins). Then the request goes on to any other handler.
  async throttle(c){
    this.throttling = c && !c.offline && (c.uploadThroughput > 0 || c.latency > 0) ? c : null;
    if(this.throttling && !this.throttleRoute){
      this.throttleRoute = async (route)=>{
        const t = this.throttling;
        if(t){
          // (WebKit doesn't hand over a Blob body: then its Content-Length.)
          let n = 0; try{ const b = route.request().postDataBuffer(); n = b ? b.length : 0; }catch(e){}
          if(!n && route.request().method() !== 'GET'){ try{ n = Number((await route.request().allHeaders())['content-length']) || 0; }catch(e){} }
          const ms = (t.latency || 0) + (t.uploadThroughput > 0 ? n / t.uploadThroughput * 1000 : 0);
          // Throttling turned off meanwhile: on at once, as in Chrome.
          for(const end = Date.now() + ms; Date.now() < end && this.throttling; ) await new Promise(r=> setTimeout(r, Math.min(200, end - Date.now())));
        }
        return route.fallback().catch(()=>{});
      };
      await this.p.route(webOnly, this.throttleRoute);
    }
  }
  cookies(...urls){ return this.ctx.c.cookies(urls.length ? urls : [this.p.url()]); }
  // Not Chrome, so no DevTools protocol: the few commands the tests send are
  // done Playwright's way (FakeCDP).
  createCDPSession(){ return Promise.resolve(new FakeCDP(this)); }
  target(){ return {createCDPSession: ()=> this.createCDPSession()}; }
}
// Puppeteer's mouse.wheel takes {deltaX, deltaY}; Playwright's two numbers.
class Mouse {
  constructor(m){ this.m = m; }
  move(x, y, o){ return this.m.move(x, y, o); }
  down(o){ return this.m.down(o); }
  up(o){ return this.m.up(o); }
  click(x, y, o){ return this.m.click(x, y, o); }
  dblclick(x, y, o){ return this.m.dblclick(x, y, o); }
  wheel(o){ return this.m.wheel((o && o.deltaX) || 0, (o && o.deltaY) || 0); }
}
class FakeCDP {
  constructor(page){ this.page = page; }
  async send(method, params = {}){
    switch(method){
      case 'Browser.setDownloadBehavior': case 'Page.setDownloadBehavior':
        this.page.ctx.downloadsTo(params.behavior === 'allow' ? params.downloadPath : null); return {};
      case 'DOM.getDocument': return {root: {nodeId: 'document'}};
      case 'DOM.querySelector': return {nodeId: params.selector};   // the selector stands in for the node
      case 'DOM.setFileInputFiles': await this.page.p.setInputFiles(params.nodeId, params.files); return {};
      case 'Network.enable': return {};
      case 'Network.disable': await this.page.throttle(null); return {};
      case 'Network.emulateNetworkConditions': await this.page.throttle(params); return {};
      default: throw new Error('no ' + method + ' in ' + ENGINE);
    }
  }
  on(){} off(){} detach(){ return Promise.resolve(); }
}
function waitOpts(o){
  const w = o && o.waitUntil;
  return {waitUntil: w === 'networkidle0' || w === 'networkidle2' ? 'networkidle' : w === 'domcontentloaded' ? 'domcontentloaded' : 'load', timeout: (o && o.timeout) || 60000};
}

class Context {
  // A persistent context (a profile on disk), not a private one: WebKit's
  // private sessions can't keep a Blob in IndexedDB ("Error preparing
  // Blob/File data to be stored in object store"), as in Safari's Private
  // Browsing, and a test's library is mostly Blobs. It opens with a blank
  // page, which the first newPage() uses.
  constructor(c, dir){ this.c = c; this.dir = dir; this.spare = c.pages()[0] || null; this.dlDir = null; this.wrapped = new Map();
    const watch = (p)=> p.on('download', async (d)=>{ if(!this.dlDir) return; try{ await d.saveAs(path.join(this.dlDir, d.suggestedFilename())); }catch(e){} });
    c.pages().forEach(watch); c.on('page', watch); }
  wrap(p){ if(!this.wrapped.has(p)) this.wrapped.set(p, new Page(p, this)); return this.wrapped.get(p); }
  async newPage(){ const s = this.spare; this.spare = null; return this.wrap(s && !s.isClosed() ? s : await this.c.newPage()); }
  downloadsTo(dir){ this.dlDir = dir; }
  async close(){ await this.c.close().catch(()=>{}); try{ fs.rmSync(this.dir, {recursive: true, force: true}); }catch(e){} }
  pages(){ return this.c.pages().filter(p=> p !== this.spare).map(p=> this.wrap(p)); }
  // One at a time: a permission this engine doesn't know is left out.
  async overridePermissions(origin, perms){ for(const x of perms) await this.c.grantPermissions([x], {origin}).catch(()=>{}); }
}

class Browser {
  constructor(type, opts){ this.type = type; this.opts = opts; this.contexts = []; this.defaultCtx = null; }
  async createBrowserContext(){
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p37-' + ENGINE + '-'));
    const c = new Context(await this.type.launchPersistentContext(dir, {...this.opts, acceptDownloads: true}), dir);
    this.contexts.push(c); return c;
  }
  createIncognitoBrowserContext(){ return this.createBrowserContext(); }
  defaultBrowserContext(){ return this.defaultCtx; }
  async newPage(){ return this.defaultCtx.newPage(); }
  async close(){ for(const c of this.contexts) await c.close(); }
  version(){ return Promise.resolve(ENGINE); }
}

module.exports = {
  async launch(o){
    const type = ENGINE === 'webkit' ? pw.webkit : ENGINE === 'firefox' ? pw.firefox : pw.chromium;
    const opts = {headless: true};
    // Checking the adapter against Chrome: the Chrome the tests normally use.
    if(type === pw.chromium && o && o.executablePath) opts.executablePath = o.executablePath;
    if(type === pw.chromium) opts.args = (o && o.args) || [];
    if(type === pw.firefox) opts.firefoxUserPrefs = {'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0};
    const b = new Browser(type, opts);
    b.defaultCtx = await b.createBrowserContext();   // as in Puppeteer, there from the start
    return b;
  },
};
