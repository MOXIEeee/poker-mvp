// 截新版 result panel（含 toggle 亮牌/弃牌）
import { chromium } from 'playwright';

const BASE = 'https://poker-mvp-liart.vercel.app';

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 3 人 all-in
const create = await api('/api/rooms', 'POST', {
  nickname: 'Alice', maxPlayers: 3, smallBlind: 10, bigBlind: 20, startingChips: 200,
});
const roomId = create.data.roomId;
const aliceId = create.data.playerId;
const bobJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Bob' });
const bobId = bobJoin.data.playerId;
const carolJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Carol' });
const carolId = carolJoin.data.playerId;
await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: aliceId, action: 'all_in' });
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: bobId, action: 'all_in' });
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: carolId, action: 'all_in' });
console.log(`Room ${roomId} ready at showdown`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
await page.goto(BASE);
await page.evaluate(({ rid, pid }) => {
  sessionStorage.setItem(`poker_${rid}`, pid);
}, { rid: roomId, pid: aliceId });
await page.goto(`${BASE}/room/${roomId}`);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/result-default.png', fullPage: true });
console.log('  result-default.png ✓');

// Alice 点亮牌
await page.click('button:has-text("🂠 藏")');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/result-alice-revealed.png', fullPage: true });
console.log('  result-alice-revealed.png ✓');

// Bob 也点亮牌
await page.click('button:has-text("🂠 藏")');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/result-bob-also-revealed.png', fullPage: true });
console.log('  result-bob-also-revealed.png ✓');

await browser.close();
console.log('Done!');
