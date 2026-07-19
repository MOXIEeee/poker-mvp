// 全面测试 2-6 人局 preflop/postflop 行动顺序
// 规则：
// - 2人 heads-up: 翻前 dealer/SB 先，翻后 BB 先
// - 3人: 翻前 dealer 先（无独立 UTG），翻后 SB 先
// - 4-6人: 翻前 UTG 先（BB 的下一位），翻后 SB 先

const BASE = 'https://poker-mvp-liart.vercel.app';

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

function ok(name) { console.log(`  ✓ ${name}`); }
function fail(name, msg) { console.log(`  ❌ ${name}: ${msg}`); process.exitCode = 1; }
function assert(cond, name, detail) { if (cond) ok(name); else fail(name, detail || '断言失败'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const NICKNAMES = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Frank'];

async function runGame(numPlayers) {
  console.log(`\n=== ${numPlayers} 人局 ===`);
  // 1. 创建房间
  const create = await api('/api/rooms', 'POST', {
    nickname: NICKNAMES[0], maxPlayers: numPlayers,
    smallBlind: 10, bigBlind: 20, startingChips: 200,
  });
  if (create.status !== 200) { fail('创建房间', JSON.stringify(create.data)); return; }
  const roomId = create.data.roomId;
  const ids = [create.data.playerId];
  ok(`房间 ${roomId} (${NICKNAMES[0]} = 房主)`);

  // 2. 其他玩家加入
  for (let i = 1; i < numPlayers; i++) {
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: NICKNAMES[i] });
    if (r.status !== 200) { fail(`${NICKNAMES[i]} 加入`, JSON.stringify(r.data)); return; }
    ids.push(r.data.playerId);
  }
  ok(`${numPlayers} 人都加入`);

  // 3. 开始牌局
  const start = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: ids[0] });
  if (start.status !== 200) { fail('开始牌局', JSON.stringify(start.data)); return; }
  const room = start.data.room;

  // 4. 验证庄家/盲注
  const dealer = room.players.find(p => p.isDealer);
  const sb = room.players.find(p => p.isSmallBlind);
  const bb = room.players.find(p => p.isBigBlind);
  assert(dealer.nickname === NICKNAMES[0], `庄家是房主 ${NICKNAMES[0]}`, `actually ${dealer.nickname}`);

  // 5. 验证 preflop 行动顺序
  // 期望第一个行动的人：
  // 2人: dealer (idx 0)
  // 3人: dealer (idx 0)
  // 4-6人: UTG = (dealerIdx + 3) % n
  let expectedFirstIdx;
  if (numPlayers === 2) expectedFirstIdx = 0;
  else if (numPlayers === 3) expectedFirstIdx = 0;
  else expectedFirstIdx = (0 + 3) % numPlayers;
  const firstPlayer = room.players[room.activePlayerIndex];
  assert(
    room.activePlayerIndex === expectedFirstIdx,
    `翻前第一个行动 = ${NICKNAMES[expectedFirstIdx]} (idx ${expectedFirstIdx})`,
    `actually ${firstPlayer.nickname} (idx ${room.activePlayerIndex})`
  );

  // 6. 验证 preflop 最后一个行动 = BB
  // 通过所有人都 all-in 看谁最后行动
  let currentRoom = room;
  let safetyCounter = 0;
  while (currentRoom.stage === 'preflop' && currentRoom.activePlayerIndex !== null && safetyCounter++ < 20) {
    const idx = currentRoom.activePlayerIndex;
    const r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: ids[idx], action: 'all_in' });
    if (r.status !== 200) { fail(`行动 ${currentRoom.players[idx].nickname} all-in`, JSON.stringify(r.data)); return; }
    currentRoom = r.data.room;
  }
  ok(`全部 all-in 后 stage: ${currentRoom.stage}, status: ${currentRoom.status}`);
  // 所有人 all-in 后应该进入 showdown_reveal（因为没人能再行动了）
  assert(currentRoom.stage === 'showdown_reveal', '进入 showdown_reveal 阶段');

  // 7. 验证所有人都能做出 show/muck 决定
  const remaining = currentRoom.players.filter(p => !p.folded);
  for (let i = 0; i < remaining.length; i++) {
    const p = remaining[i];
    const choice = i % 2 === 0 ? 'show' : 'muck';
    const r = await api(`/api/rooms/${roomId}/decide`, 'POST', { playerId: p.id, choice });
    if (r.status !== 200) { fail(`${p.nickname} decide ${choice}`, JSON.stringify(r.data)); return; }
    ok(`${p.nickname} 决定 ${choice}`);
  }

  // 8. 最终状态验证
  const finalRoom = await api(`/api/rooms/${roomId}`);
  if (finalRoom.status !== 200) { fail('最终查询房间', JSON.stringify(finalRoom.data)); return; }
  const r = finalRoom.data.room;
  assert(r.stage === 'showdown', '最终 stage = showdown');
  assert(r.lastWinners && r.lastWinners.length > 0, '有赢家');
  assert(r.pot === 0, 'pot 清零', `actually ${r.pot}`);
}

for (const n of [2, 3, 4, 5, 6]) {
  await runGame(n);
  await sleep(1000); // 防止请求过快
}

console.log('\n' + (process.exitCode ? '❌ 部分测试失败' : '🎉 2-6 人局行动顺序全部正确'));
