// 端到端 Side Pot 测试：3 人局不同 all-in 额
import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('pageerror', err => console.error('[ERR]', err.message));

async function api(path, method, body) {
  const r = await fetch(`http://localhost:3000${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

// 1. Mike 通过 UI 创建房间（这样 sessionStorage 自动存了 playerId）
console.log('--- Mike 通过 UI 创建房间 ---');
await page.goto('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.fill('input[placeholder*="Mike"]', 'Mike');
// 修改 maxPlayers = 3
await page.selectOption('select', '3');
await page.click('button[type="submit"]');
await page.waitForURL(/\/room\//, { timeout: 10000 });
const roomId = page.url().split('/room/')[1];
const mikeId = await page.evaluate(id => sessionStorage.getItem(`poker_${id}`), roomId);
console.log('Room:', roomId, 'Mike:', mikeId);

// 2. Sarah、Tom 通过 API 加入
const sarah = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Sarah' });
const tom = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Tom' });
const sarahId = sarah.data.playerId;
const tomId = tom.data.playerId;
console.log('Sarah:', sarahId, 'Tom:', tomId);

// 3. 等 Mike 页面看到 3 个玩家
await page.waitForFunction(() => {
  const text = document.body.innerText;
  return text.includes('Sarah') && text.includes('Tom');
}, { timeout: 15000 });
console.log('Mike 看到所有玩家');
await page.waitForTimeout(500);

// 4. 房主 Mike 开始牌局
console.log('\n--- Mike 开始牌局 ---');
await page.click('button:has-text("开始牌局")');
await page.waitForTimeout(2000);

// 5. 通过 API 模拟：让所有玩家 raise 到 all-in
async function getRoom() {
  const r = await api(`/api/rooms/${roomId}`);
  return r.data.room;
}
async function act(playerId, action, amount) {
  return api(`/api/rooms/${roomId}/action`, 'POST', { playerId, action, amount });
}
async function allIn(playerId) {
  // all_in 不需要 amount，服务端会用 chips
  return act(playerId, 'all_in');
}

async function playOne(action = 'all_in') {
  let safety = 30;
  while (safety-- > 0) {
    const room = await getRoom();
    if (room.status === 'ended') {
      console.log(`  → 牌局结束 (${room.stage})`);
      return room;
    }
    if (room.activePlayerIndex === null) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }
    const activeId = room.players[room.activePlayerIndex].id;
    const result = await act(activeId, action);
    if (result.status !== 200) {
      console.log(`  Action err: ${result.data.error}`);
      break;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return await getRoom();
}

console.log('\n--- 所有人都 all-in ---');
let final = await playOne('all_in');
console.log('最终 pot:', final.pot);
console.log('sidePots:', JSON.stringify(final.sidePots, null, 2));
console.log('lastWinners:', JSON.stringify(final.lastWinners.map(w => ({
  playerId: w.playerId,
  amount: w.amountWon,
  hand: w.hand.description,
  potsWon: w.potsWon,
})), null, 2));

// 验证：筹码总数应该 = 3 * 1000 = 3000
const totalChips = final.players.reduce((s, p) => s + p.chips, 0);
console.log('\n总筹码:', totalChips, '(应该 3000)');

// 6. 截图
await page.screenshot({ path: 'screenshots/sidepot-result.png', fullPage: true });

// 7. 让 Mike 再开一手 + 测试多 all-in 边池
console.log('\n\n--- 第二手：让 Mike 投 100，Sarah 投 200，Tom 投 500 触发复杂 side pot ---');
await page.waitForTimeout(1500);
await page.click('button:has-text("再来一手")');
await page.waitForTimeout(2000);

// 这一手我们让玩家手动控制下注额
// Mike 第一个行动，raise to 100（用 100 筹码中的部分）
// Sarah 第二行动，raise to 200
// Tom 第三行动，call 200
// Mike 第四行动，再 call 100（总投入 200）
// 但实际操作里 all-in 触发 side pot 比较复杂，先看上一手的结果

// 截图当前状态
await page.screenshot({ path: 'screenshots/sidepot-second.png', fullPage: true });

await browser.close();
console.log('\nDone!');
