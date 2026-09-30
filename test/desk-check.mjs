// Drives the installed app through its DevTools port: the page it opened,
// the ABS bar it paints, the site reached from inside it, and the taskbar
// badge the page sets through the preload bridge. Writes a screenshot.
import { writeFileSync } from "node:fs";

const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error("FAIL: " + msg); process.exit(1); };

async function findPage() {
  for (let i = 0; i < 90; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = pages.find((p) => p.type === "page" && /absmotsauto\.co\.uk\/admin/.test(p.url));
      if (page) return page;
    } catch { /* app still starting */ }
    await sleep(1000);
  }
  fail("the app did not open https://www.absmotsauto.co.uk/admin within 90 seconds");
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, close: () => ws.close() }); });
}

const page = await findPage();
console.log("Opened:", page.url);
const cdp = await connect(page.webSocketDebuggerUrl);
const evaluate = async (expression) => {
  const r = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
};

let state;
for (let i = 0; i < 60; i++) {
  state = await evaluate(`(async () => ({
    title: document.title,
    url: location.href,
    bar: !!document.getElementById("abs-desk-bar"),
    signIn: /sign in/i.test(document.body ? document.body.innerText : ""),
    brand: /ABS MOTS/i.test(document.body ? document.body.innerText : ""),
    bridge: !!(window.absDesktop && window.absDesktop.isDesktop),
    health: await fetch("/api/health").then((r) => r.status).catch(() => 0),
  }))()`);
  if (state && state.bar && state.signIn && state.health === 200) break;
  await sleep(1000);
}
console.log("Page:", JSON.stringify(state));
if (!state) fail("could not read the page");
if (!/absmotsauto\.co\.uk\/admin/.test(state.url)) fail("wrong page: " + state.url);
if (!state.bar) fail("the ABS MOTS bar was not added to the window");
if (!state.signIn || !state.brand) fail("the ABS sign-in page did not show");
if (!state.bridge) fail("the desktop bridge (absDesktop) is missing");
if (state.health !== 200) fail("the website could not be reached from the app: " + state.health);

// The page tells the app about waiting bookings; the window title shows it.
await evaluate(`window.absDesktop.setPendingBookings(3); true`);
await sleep(1500);

const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
if (!shot.result || !shot.result.data) fail("no screenshot");
writeFileSync("desk-screenshot.png", Buffer.from(shot.result.data, "base64"));
console.log("Screenshot saved");
cdp.close();
console.log("PASS: the app opens the ABS admin desk on Windows");
