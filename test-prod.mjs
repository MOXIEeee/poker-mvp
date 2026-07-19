import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.on('pageerror', err => console.error('[ERR]', err.message));

// 1. 打开首页
console.log('--- 1. 打开首页 ---');
await page.goto('https://poker-mvp-liart.vercel.app/');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: 'screenshots/prod-01-home.png', fullPage: true });
console.log('✓ 首页 OK');

// 2. 创建房间
console.log('\n--- 2. 创建房间 ---');
await page.fill('input[placeholder*="Mike"]', 'Alice');
await page.selectOption('select', '3');
await page.click('button[type="submit"]');
await page.waitForURL(/\/room\//, { timeout: 15000 });
const roomId = page.url().split('/room/')[1];
console.log('✓ 创建房间:', roomId);
await page.waitForTimeout(2000);

// 3. 另一个窗口（context 隔离）作为 Bob 加入
console.log('\n--- 3. Bob 加入 ---');
const bobContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const bobPage = await bobContext.newPage();
await bobPage.goto('https://poker-mvp-liart.vercel.app/');
await bobPage.waitForLoadState('networkidle');
await bobPage.click('button:has-text("加入房间")');
await bobPage.fill('input[placeholder*="A1B2"]', roomId.replace('POKER-', ''));
await bobPage.fill('input[placeholder*="Tom"]', 'Bob');
await bobPage.click('button[type="submit"]');
await bobPage.waitForURL(/\/room\//, { timeout: 15000 });
console.log('✓ Bob 加入成功');

// 等 Pusher 推送
await page.waitForFunction(() => {
  const t = document.body.innerText;
  return t.includes('Bob');
}, { timeout: 15000 });
console.log('✓ Alice 看到 Bob');

// 4. 截图（两人在大厅）
await page.screenshot({ path: 'screenshots/prod-02-lobby.png', fullPage: true });

// 5. Alice 开始牌局
await page.waitForTimeout(500);
await page.click('button:has-text("开始牌局")');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/prod-03-table.png', fullPage: true });
console.log('✓ 牌局开始');

// 6. Alice 行动
const foldButton = await page.$('button:has-text("弃牌")');
if (foldButton) {
  await foldButton.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/prod-04-after-fold.png', fullPage: true });
  console.log('✓ Alice 弃牌');
}

// 7. Bob 视角
await bobPage.waitForTimeout(2000);
await bobPage.screenshot({ path: 'screenshots/prod-05-bob-view.png', fullPage: true });

await browser.close();
console.log('\nDone! 部署验证完成 ✓');
