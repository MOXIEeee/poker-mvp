// 端到端断线重连测试
import { chromium } from 'playwright';

const browser = await chromium.launch();

// 客户端 1：Mike（创建 + 操作 + 关掉重开）
const mikeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const mikePage = await mikeContext.newPage();
mikePage.on('console', msg => console.log('[Mike]', msg.text()));

// 客户端 2：Sarah（加入 + 等待）
const sarahContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const sarahPage = await sarahContext.newPage();
sarahPage.on('console', msg => console.log('[Sarah]', msg.text()));

console.log('--- 1. Mike 创建房间 ---');
await mikePage.goto('http://localhost:3000/');
await mikePage.waitForLoadState('networkidle');
await mikePage.fill('input[placeholder*="Mike"]', 'Mike');
await mikePage.click('button[type="submit"]');
await mikePage.waitForURL(/\/room\//, { timeout: 10000 });
const roomUrl = mikePage.url();
const roomId = roomUrl.split('/room/')[1];
console.log('Room:', roomId);

console.log('\n--- 2. Sarah 通过 UI 加入 ---');
// Sarah 打开她的页面
await sarahPage.goto(`http://localhost:3000/`);
await sarahPage.waitForLoadState('networkidle');
await sarahPage.click('button:has-text("加入房间")');
await sarahPage.fill('input[placeholder*="A1B2"]', roomId.replace('POKER-', ''));
await sarahPage.fill('input[placeholder*="Tom"]', 'Sarah');
await sarahPage.click('button[type="submit"]');
await sarahPage.waitForURL(/\/room\//, { timeout: 10000 });
console.log('Sarah 加入了房间');

await mikePage.waitForTimeout(1500);
await mikePage.waitForFunction(() => document.body.innerText.includes('Sarah'), { timeout: 10000 });
console.log('Mike 看到 Sarah');

console.log('\n--- 3. Mike 开始牌局 ---');
await mikePage.click('button:has-text("开始牌局")');
await mikePage.waitForTimeout(2000);

console.log('\n--- 4. 模拟 Mike 刷新页面（断线重连） ---');
await mikePage.reload();
await mikePage.waitForLoadState('networkidle');
await mikePage.waitForTimeout(2000);
const mikeBody = await mikePage.evaluate(() => document.body.innerText);
const mikeReconnected = !mikeBody.includes('重连失败') && !mikeBody.includes('未找到玩家身份');
console.log(`Mike 刷新后 → ${mikeReconnected ? '✓ 自动重连' : '✗ 重连失败'}`);
if (!mikeReconnected) {
  console.log('  Mike 页面:', mikeBody.slice(0, 200));
}

await mikePage.screenshot({ path: 'screenshots/reconnect-mike.png', fullPage: true });

// Sarah 还在
await sarahPage.waitForTimeout(2000);
await sarahPage.screenshot({ path: 'screenshots/reconnect-sarah.png', fullPage: true });

await browser.close();
console.log('\nDone!');
