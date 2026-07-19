// 截 show/muck 阶段的图
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

// API 流程：建 3 人房 → all-in → 进 showdown_reveal
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
// 全部 all-in
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: aliceId, action: 'all_in' });
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: bobId, action: 'all_in' });
await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: carolId, action: 'all_in' });
console.log(`Room ${roomId} ready at showdown_reveal`);

const browser = await chromium.launch();
async function takeShot(playerId, nickname, filename, doDecide) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  // 直接用 sessionStorage 模拟已加入
  await page.goto(BASE);
  await page.evaluate(({ rid, pid }) => {
    sessionStorage.setItem(`poker_${rid}`, pid);
  }, { rid: roomId, pid: playerId });
  await page.goto(`${BASE}/room/${roomId}`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `screenshots/${filename}`, fullPage: true });
  console.log(`  ${filename} ✓`);
  if (doDecide) {
    const choice = doDecide;
    await page.click(`button:has-text("${choice === 'show' ? '亮牌' : '弃牌'}")`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `screenshots/${filename.replace('.png', '-after.png')}`, fullPage: true });
    console.log(`  ${filename.replace('.png', '-after.png')} ✓`);
  }
  await context.close();
}

await takeShot(aliceId, 'Alice', 'showdown-1-alice-prompt.png', 'show');
await takeShot(bobId, 'Bob', 'showdown-2-bob-prompt.png', 'muck');
// Carol 不决定，看 "等待其他玩家" 状态
await takeShot(carolId, 'Carol', 'showdown-3-waiting.png', null);

await browser.close();
console.log('Done!');
