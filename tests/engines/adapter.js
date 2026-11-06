// A Puppeteer-shaped wrapper over Playwright, as much of it as the tests use,
// so the same test files run in WebKit (Safari's engine) and Firefox. See hook.js.
const pw = require('playwright');
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
  type(sel, t, o){ return this.p.type(sel, t, o); }
  focus(sel){ return this.p.focus(sel); }
  bringToFront(){ return this.p.bringToFront(); }
  close(){ return this.p.close(); }
  browserContext(){ return this.ctx; }
  setUserAgent(){ return Promise.resolve(); }
  emulate(d){ return d && d.viewport ? this.setViewport(d.viewport) : Promise.resolve(); }
  // Puppeteer's request interception, on Playwright's routes.
  async setRequestInterception(on){
    this.intercept = on;
    if(on && !this.routed){
      this.routed = true;
      await this.p.route('**/*', (route)=>{
        const req = route.request();
        let settled = false;
        const r = {
          url: ()=> req.url(), method: ()=> req.method(), headers: ()=> req.headers(), resourceType: ()=> req.resourceType(),
          isInterceptResolutionHandled: ()=> settled,
          respond: (x)=>{ settled = true; return route.fulfill({status: x.status || 200, contentType: x.contentType, headers: x.headers, body: x.body}); },
          continue: ()=>{ settled = true; return route.continue(); },
          abort: ()=>{ settled = true; return route.abort(); },
        };
        if(!this.intercept || !this.requestHandlers.length) return route.continue();
        for(const h of this.requestHandlers) h(r);
        if(!settled) return route.continue();
      });
    }
  }
  on(ev, fn){
    if(ev === 'request'){ this.requestHandlers.push(fn); return this; }
    this.p.on(ev, fn); return this;
  }
  off(ev, fn){ if(ev === 'request') this.requestHandlers = this.requestHandlers.filter(f=> f !== fn); else this.p.off(ev, fn); return this; }
  removeAllListeners(ev){ if(!ev || ev === 'request') this.requestHandlers = []; if(ev) this.p.removeAllListeners(ev); return this; }
  createCDPSession(){ throw new Error('no CDP in ' + ENGINE); }
  target(){ throw new Error('no CDP targets in ' + ENGINE); }
}
function waitOpts(o){
  const w = o && o.waitUntil;
  return {waitUntil: w === 'networkidle0' || w === 'networkidle2' ? 'networkidle' : w === 'domcontentloaded' ? 'domcontentloaded' : 'load', timeout: (o && o.timeout) || 60000};
}

class Context {
  constructor(c){ this.c = c; }
  async newPage(){ return new Page(await this.c.newPage(), this); }
  close(){ return this.c.close(); }
  pages(){ return this.c.pages().map(p=> new Page(p, this)); }
  overridePermissions(){ return Promise.resolve(); }
}

class Browser {
  constructor(b){ this.b = b; this.defaultCtx = null; }
  async createBrowserContext(){ return new Context(await this.b.newContext({acceptDownloads: true})); }
  createIncognitoBrowserContext(){ return this.createBrowserContext(); }
  defaultBrowserContext(){ return this.defaultCtx; }
  async newPage(){ if(!this.defaultCtx) this.defaultCtx = await this.createBrowserContext(); return this.defaultCtx.newPage(); }
  close(){ return this.b.close(); }
  version(){ return this.b.version(); }
}

module.exports = {
  async launch(o){
    const type = ENGINE === 'webkit' ? pw.webkit : ENGINE === 'firefox' ? pw.firefox : pw.chromium;
    const opts = {headless: true};
    // Checking the adapter against Chrome: the Chrome the tests normally use.
    if(type === pw.chromium && o && o.executablePath) opts.executablePath = o.executablePath;
    if(type === pw.chromium) opts.args = (o && o.args) || [];
    if(type === pw.firefox) opts.firefoxUserPrefs = {'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0};
    return new Browser(await type.launch(opts));
  },
};
