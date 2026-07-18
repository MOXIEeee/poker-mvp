import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// 1. 首页
await page.goto('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'screenshots/01-home.png', fullPage: true });
console.log('1. Home page captured');

// 2. 创建房间 → 填表 → 提交
await page.fill('input[placeholder*="Mike"]', 'Mike');
await page.click('button[type="submit"]');
await page.waitForURL(/\/room\//, { timeout: 10000 });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'screenshots/02-lobby.png', fullPage: true });
console.log('2. Lobby captured:', page.url());

// 提取 roomId 和 playerId
const url = page.url();
const roomId = url.split('/room/')[1];
const playerId = await page.evaluate((id) => sessionStorage.getItem(`poker_${id}`), roomId);
console.log(`Room: ${roomId}, Player: ${playerId}`);

// 3. 模拟另一个玩家加入（通过 API）
const player2 = await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'Sarah' }),
}).then(r => r.json());
console.log('Player 2:', player2.playerId);

const player3 = await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'Tom' }),
}).then(r => r.json());
console.log('Player 3:', player3.playerId);

const player4 = await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: 'Anna' }),
}).then(r => r.json());
console.log('Player 4:', player4.playerId);

// 刷新页面，看到 4 个玩家
await page.waitForTimeout(2000);
await page.reload();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/03-lobby-4players.png', fullPage: true });
console.log('3. Lobby with 4 players captured');

// 4. 开始牌局
await page.click('button:has-text("开始牌局")');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/04-table-preflop.png', fullPage: true });
console.log('4. Table preflop captured');

// 5. 模拟一系列操作（Mike 是房主，fold）
const mike_fold = await fetch(`http://localhost:3000/api/rooms/${roomId}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerId, action: 'fold' }),
}).then(r => r.json());
console.log('Mike fold:', mike_fold.error || 'OK');

await page.waitForTimeout(2000);
await page.screenshot({ path: 'screenshots/05-after-fold.png', fullPage: true });
console.log('5. After fold captured');

await browser.close();
console.log('Done!');
