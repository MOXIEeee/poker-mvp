import { chromium } from 'playwright';

const browser = await chromium.launch();

// 客户端 1：Mike（创建房间 + 操作）
const context1 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page1 = await context1.newPage();
page1.on('console', msg => console.log('[Mike]', msg.text()));
page1.on('pageerror', err => console.error('[Mike ERR]', err.message));

// 客户端 2：Sarah（加入 + 等待接收 Pusher 事件）
const context2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page2 = await context2.newPage();
page2.on('console', msg => console.log('[Sarah]', msg.text()));
page2.on('pageerror', err => console.error('[Sarah ERR]', err.message));

console.log('--- 1. Mike 创建房间 ---');
await page1.goto('http://localhost:3000/');
await page1.waitForLoadState('networkidle');
await page1.fill('input[placeholder*="Mike"]', 'Mike');
await page1.click('button[type="submit"]');
await page1.waitForURL(/\/room\//, { timeout: 10000 });
const roomUrl = page1.url();
const roomId = roomUrl.split('/room/')[1];
console.log('Mike 创建了房间:', roomId);
await page1.waitForLoadState('networkidle');

console.log('\n--- 2. Sarah 加入房间 ---');
await page2.goto(`http://localhost:3000/`);
await page2.waitForLoadState('networkidle');
// 切到加入房间 tab
await page2.click('button:has-text("加入房间")');
await page2.fill('input[placeholder*="A1B2"]', roomId.replace('POKER-', ''));
await page2.fill('input[placeholder*="Tom"]', 'Sarah');
await page2.click('button[type="submit"]');
await page2.waitForURL(/\/room\//, { timeout: 10000 });
console.log('Sarah 加入成功');
await page2.waitForLoadState('networkidle');

// 关键测试：Mike 切回页面，Sarah 的状态应该在 Pusher 推送下即时出现
// 等 3 秒看是否 Pusher 推送
console.log('\n--- 3. 等待 2 秒看 Pusher 推送是否同步 ---');
await page1.waitForTimeout(2000);
// Mike 刷新一次看是否看到 Sarah
const mikeSeesSarah = await page1.evaluate((id) => {
  return document.body.innerText.includes('Sarah');
}, roomId);
console.log('Mike 页面看到 Sarah:', mikeSeesSarah);

// 截图
await page1.screenshot({ path: 'screenshots/pusher-mike.png', fullPage: true });
await page2.screenshot({ path: 'screenshots/pusher-sarah.png', fullPage: true });

console.log('\n--- 4. 测试聊天同步 ---');
// Mike 发送一条聊天
await page1.fill('input[placeholder*="说点什么"]', 'Hello from Mike!');
await page1.click('button[type="submit"]');
await page1.waitForTimeout(1500);

// Sarah 应该看到这条消息
const sarahSeesChat = await page2.evaluate(() => {
  return document.body.innerText.includes('Hello from Mike!');
});
console.log('Sarah 通过 Pusher 收到 Mike 的消息:', sarahSeesChat);

console.log('\n--- 5. Sarah 发送消息给 Mike ---');
await page2.fill('input[placeholder*="说点什么"]', 'Hi Mike!');
await page2.click('button[type="submit"]');
await page1.waitForTimeout(1500);

const mikeSeesChat = await page1.evaluate(() => {
  return document.body.innerText.includes('Hi Mike!');
});
console.log('Mike 通过 Pusher 收到 Sarah 的消息:', mikeSeesChat);

await page1.screenshot({ path: 'screenshots/pusher-final.png', fullPage: true });

await browser.close();

console.log('\n--- 测试结果 ---');
console.log('玩家列表同步:', mikeSeesSarah ? '✓' : '✗');
console.log('聊天双向同步:', sarahSeesChat && mikeSeesChat ? '✓' : '✗');
console.log('Done!');
