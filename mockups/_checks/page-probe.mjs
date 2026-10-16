/* Ripis mockup probe — headless Chrome over CDP.
   Usage:
     node mockups/_checks/page-probe.mjs <file-url> <probe.js|expression>
          [--theme=dark] [--shot=out.png] [--w=430] [--h=1000] [--verbose]
   Prints the probe's value as JSON. No dependencies: Node's global fetch +
   WebSocket talk straight to the DevTools endpoint. Chrome is launched with its
   own port and a throwaway profile, then killed. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;

const argv = process.argv.slice(2);
const url = argv[0];
const probeSrc = argv[1];
const flag = (k, d) => {
  const hit = argv.filter((a) => a.startsWith('--' + k + '='))[0];
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const has = (k) => argv.indexOf('--' + k) > -1;
const theme = flag('theme', 'light');
const width = Number(flag('w', 430));
const height = Number(flag('h', 1000));
const shot = flag('shot', null);

const profile = path.join(os.tmpdir(), 'ripis-probe-' + process.pid);
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--force-color-profile=srgb',
  '--allow-file-access-from-files',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=' + width + ',' + height, 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint never came up on port ' + PORT);
}

let id = 0;
const pending = new Map();
let ws;
function send(method, params = {}) {
  const msg = { id: ++id, method, params };
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => pending.set(msg.id, { res, rej }));
}

function once(method, ms) {
  return new Promise((res) => {
    const h = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === method) { ws.removeEventListener('message', h); res(m.params); }
    };
    ws.addEventListener('message', h);
    setTimeout(res, ms || 8000);
  });
}

async function main() {
  const page = await targets();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) { p.rej(new Error(m.method + ': ' + m.error.message)); } else { p.res(m.result); }
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: true
  });
  const full = url + (url.indexOf('?') > -1 ? '&' : '?') + 'theme=' + theme;
  const loaded = once('Page.loadEventFired', 10000);
  await send('Page.navigate', { url: full });
  await loaded;
  await sleep(600);                        // let the inline script paint

  const expr = fs.existsSync(probeSrc) ? fs.readFileSync(probeSrc, 'utf8') : probeSrc;
  const ev = await send('Runtime.evaluate', {
    expression: '(' + expr + ')', returnByValue: true, awaitPromise: true
  });
  if (ev.exceptionDetails) {
    console.error('PROBE THREW: ' + JSON.stringify(ev.exceptionDetails.exception, null, 1));
    process.exitCode = 2;
  }
  const v = ev.result ? ev.result.value : null;
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

  if (shot) {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.cssContentSize || m.contentSize;
    const s = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.min(cs.width, width + 200), height: Math.min(cs.height, 5200), scale: 1 }
    });
    fs.writeFileSync(shot, Buffer.from(s.data, 'base64'));
    console.log('shot: ' + shot);
  }
}

main()
  .catch((e) => { console.error('FAILED: ' + e.message); process.exitCode = 1; })
  .finally(() => {
    try { if (ws) { ws.close(); } } catch (e) {}
    child.kill();
    setTimeout(() => process.exit(process.exitCode || 0), 250);
  });

