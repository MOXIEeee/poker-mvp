import { chromium, devices } from 'playwright';

const BASE = 'https://poker-mvp-liart.vercel.app';

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// 创建一个房间 + 几个玩家
const c = await api('/api/rooms', 'POST', {
  nickname: 'Alice', maxPlayers: 4, smallBlind: 10, bigBlind: 20, startingChips: 1000,
});
const id = c.data.roomId;
const aliceId = c.data.playerId;
await api(`/api/rooms/${id}/join`, 'POST', { nickname: 'Bob' });
await api(`/api/rooms/${id}/join`, 'POST', { nickname: 'Carol' });
await api(`/api/rooms/${id}/join`, 'POST', { nickname: 'Dan' });

const browser = await chromium.launch();

// 主页 (iPhone 12)
let ctx = await browser.newContext({ ...devices['iPhone 12'] });
let page = await ctx.newPage();
await page.goto(BASE);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'screenshots/mobile-1-home.png', fullPage: true });
console.log('mobile-1-home.png ✓');

// 房间页 (等在大厅)
await page.goto(`${BASE}/room/${id}`);
await page.evaluate(({ rid, pid }) => {
  sessionStorage.setItem(`poker_${rid}`, pid);
}, { rid: id, pid: aliceId });
await page.goto(`${BASE}/room/${id}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/mobile-2-lobby.png', fullPage: true });
console.log('mobile-2-lobby.png ✓');

// 开始牌局
await api(`/api/rooms/${id}/start`, 'POST', { playerId: aliceId });
await page.reload();
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/mobile-3-table.png', fullPage: true });
console.log('mobile-3-table.png ✓');
await ctx.close();

// 平板 (iPad Mini)
ctx = await browser.newContext({ ...devices['iPad Mini'] });
page = await ctx.newPage();
await page.goto(BASE);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'screenshots/tablet-1-home.png', fullPage: true });
console.log('tablet-1-home.png ✓');

await page.goto(`${BASE}/room/${id}`);
await page.evaluate(({ rid, pid }) => {
  sessionStorage.setItem(`poker_${rid}`, pid);
}, { rid: id, pid: aliceId });
await page.goto(`${BASE}/room/${id}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/tablet-2-table.png', fullPage: true });
console.log('tablet-2-table.png ✓');
await ctx.close();

await browser.close();
