import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.fill('input[placeholder*="Mike"]', 'Mike');
await page.click('button[type="submit"]');
await page.waitForURL(/\/room\//, { timeout: 10000 });
const roomId = page.url().split('/room/')[1];
await page.waitForTimeout(500);

// 加入 3 个玩家
for (const nick of ['Sarah', 'Tom', 'Anna']) {
  await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick }),
  });
}
await page.waitForTimeout(1500);
await page.waitForFunction(() => document.body.innerText.includes('Sarah'), { timeout: 8000 });
await page.waitForTimeout(500);

// 截图 1：聊天打开
await page.screenshot({ path: 'screenshots/chat-open.png', fullPage: true });
console.log('1. Chat open');

// 点击"收起"
await page.click('button:has-text("收起")');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/chat-closed.png', fullPage: true });
console.log('2. Chat closed');

// 点击"打开聊天"
await page.click('button:has-text("打开聊天")');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/chat-reopened.png', fullPage: true });
console.log('3. Chat reopened');

await browser.close();
