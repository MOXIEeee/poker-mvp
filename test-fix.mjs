import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.on('pageerror', err => console.error('[ERR]', err.message));

// 1. 创建房间
console.log('--- 创建房间（4 人局）---');
await page.goto('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.fill('input[placeholder*="Mike"]', 'Mike');
await page.click('button[type="submit"]');
await page.waitForURL(/\/room\//, { timeout: 10000 });
const roomId = page.url().split('/room/')[1];
const mikeId = await page.evaluate(id => sessionStorage.getItem(`poker_${id}`), roomId);
console.log('Room:', roomId, 'Mike:', mikeId);

// 2. API 加入 3 个玩家
const players = [{ id: mikeId, name: 'Mike' }];
for (const nick of ['Sarah', 'Tom', 'Anna']) {
  const r = await fetch(`http://localhost:3000/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nick }),
  });
  const data = await r.json();
  players.push({ id: data.playerId, name: nick });
  console.log('Joined:', nick, data.playerId);
}
await page.waitForTimeout(1500);

// 3. 开始牌局 - 等 Pusher 推送到 Mike 页面
console.log('\n--- 等待 Pusher 推送玩家加入 ---');
await page.screenshot({ path: 'screenshots/debug-mike-before-start.png', fullPage: true });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'screenshots/debug-mike-after-wait.png', fullPage: true });
const bodyText = await page.evaluate(() => document.body.innerText);
console.log('Mike 页面文本（前 200 字符）:', bodyText.slice(0, 200));
await page.waitForFunction(() => {
  const text = document.body.innerText;
  return text.includes('Sarah') && text.includes('Tom') && text.includes('Anna');
}, { timeout: 10000 });
console.log('Mike 页面已看到 4 个玩家');
await page.waitForTimeout(500);
await page.click('button:has-text("开始牌局")');
await page.waitForTimeout(2000);

// 4. 循环让每个玩家 call/check 直到一局结束
async function act(playerId, action, amount) {
  const r = await fetch(`http://localhost:3000/api/rooms/${roomId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, action, amount }),
  });
  return r.json();
}

async function getRoom() {
  const r = await fetch(`http://localhost:3000/api/rooms/${roomId}`);
  return (await r.json()).room;
}

async function getActivePlayerId(room) {
  if (room.activePlayerIndex === null) return null;
  return room.players[room.activePlayerIndex].id;
}

async function playOneRound(action = 'call') {
  // 跑直到牌局阶段变化
  let lastStage = '';
  let safety = 50;
  while (safety-- > 0) {
    const room = await getRoom();
    if (room.status === 'ended') {
      console.log(`  → 牌局结束 (${room.stage})`);
      return room;
    }
    if (room.stage !== lastStage) {
      console.log(`  → 阶段变为: ${room.stage} (公共牌 ${room.communityCards.length} 张)`);
      lastStage = room.stage;
    }
    const activeId = await getActivePlayerId(room);
    if (!activeId) {
      await new Promise(r => setTimeout(r, 100));
      continue;
    }
    const result = await act(activeId, action);
    if (result.error) {
      // 如果是 check 失败（要 call），改成 call
      if (action === 'check' && result.error.includes('过牌')) {
        await act(activeId, 'call');
      } else {
        console.log('  Action error:', result.error);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

console.log('\n--- Preflop: 让所有人 call ---');
await playOneRound('call');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/fix-flop-3cards.png', fullPage: true });
console.log('Flop 截图已保存');

console.log('\n--- Flop: 让所有人 check（如果不能 check 则 call）---');
await playOneRound('check');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/fix-turn-4cards.png', fullPage: true });
console.log('Turn 截图已保存');

console.log('\n--- Turn: 让所有人 check/call ---');
await playOneRound('check');
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/fix-river-5cards.png', fullPage: true });
console.log('River 截图已保存');

// 5. 摊牌
console.log('\n--- River: 让所有人 check/call ---');
const final = await getRoom();
console.log('Final state:', final.stage, 'communityCards:', final.communityCards.length);

await browser.close();
console.log('\nDone!');
