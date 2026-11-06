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

class Page {
  constructor(p, ctx){ this.p = p; this.ctx = ctx; this.keyboard = p.keyboard; this.mouse = p.mouse; this.intercept = false; this.requestHandlers = []; }
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
  waitForNavigation(o){ return this.p.waitForLoadState((o && o.waitUntil === 'networkidle0') ? 'networkidle' : 'load'); }
  setViewport(v){ return this.p.setViewportSize({width: v.width, height: v.height}); }
  screenshot(o){ return this.p.screenshot(o); }
  $(sel){ return this.p.$(sel).then(x=> x && new Element(x)); }
  $$(sel){ return this.p.$$(sel).then(xs=> xs.map(x=> new Element(x))); }
  click(sel, o){ return this.p.click(sel, o); }
  hover(sel){ return this.p.hover(sel); }
  select(sel, ...values){ return this.p.selectOption(sel, values); }
  $eval(sel, fn, ...args){ return this.p.$eval(sel, asFnOn(fn, args)); }
  $$eval(sel, fn, ...args){ return this.p.$$eval(sel, asFnOn(fn, args)); }
  type(sel, t, o){ return this.p.type(sel, t, o); }
  focus(sel){ return this.p.focus(sel); }
  bringToFront(){ return this.p.bringToFront(); }
  close(){ return this.p.close(); }
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
  emulate(d){ return d && d.viewport ? this.setViewport(d.viewport) : Promise.resolve(); }
  // Puppeteer's request interception, on Playwright's routes.
  async setRequestInterception(on){
    this.intercept = on;
    if(on && !this.routed){
      this.routed = true;
      await this.p.route('**/*', (route)=>{
        const req = route.request();
        let settled = false;
        // Settled once: a handler may answer later (a held or delayed
        // request), as in Puppeteer, so nothing here answers for it.
        const once = (f)=> settled ? Promise.resolve() : (settled = true, f().catch(()=>{}));
        const r = {
          url: ()=> req.url(), method: ()=> req.method(), headers: ()=> req.headers(), resourceType: ()=> req.resourceType(),
          isInterceptResolutionHandled: ()=> settled,
          respond: (x)=> once(()=> route.fulfill({status: x.status || 200, contentType: x.contentType, headers: x.headers, body: x.body})),
          continue: ()=> once(()=> route.continue()),
          abort: ()=> once(()=> route.abort()),
        };
        if(!this.intercept || !this.requestHandlers.length) return route.continue();
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
  cookies(...urls){ return this.ctx.c.cookies(urls.length ? urls : [this.p.url()]); }
  // Not Chrome, so no DevTools protocol: the few commands the tests send are
  // done Playwright's way (FakeCDP).
  createCDPSession(){ return Promise.resolve(new FakeCDP(this)); }
  target(){ return {createCDPSession: ()=> this.createCDPSession()}; }
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
      case 'Network.enable': case 'Network.disable': case 'Network.emulateNetworkConditions': return {};   // no throttling: the test runs at full speed
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
