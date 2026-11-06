// Runs the tests (written for Puppeteer and Chrome) in another engine through
// Playwright: with ENGINE=webkit or ENGINE=firefox (or chromium, to check the
// adapter itself against Chrome), require('puppeteer-core') gives adapter.js.
//   ENGINE=webkit NODE_OPTIONS="--require ./engines/hook.js" node e2e.js
// (run-engines.sh does this for the tests that apply.)
const Module = require('module');
const real = Module._resolveFilename;
if(process.env.ENGINE){
  Module._resolveFilename = function(request, ...rest){
    if(request === 'puppeteer-core' || request === 'puppeteer') return require.resolve('./adapter.js');
    return real.call(this, request, ...rest);
  };
}
