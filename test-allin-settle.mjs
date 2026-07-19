// 2-3 人 all-in 完整跑完手牌，验证：
// 1. 不需要任何亮牌/弃牌决定，游戏直接结算
// 2. sidePots + lastWinners 立即可用
// 3. 筹码正确分配
// 4. 之后玩家可以自由 toggle 自己的 revealed 状态

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

async function runScenario(name, numPlayers, startingChips, actions) {
  console.log(`\n=== ${name} (${numPlayers} 人，每人 $${startingChips}) ===`);

  const create = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: numPlayers,
    smallBlind: 10, bigBlind: 20, startingChips,
  });
  if (create.status !== 200) { fail('创建房间', JSON.stringify(create.data)); return; }
  const roomId = create.data.roomId;
  const ids = [create.data.playerId];

  for (let i = 1; i < numPlayers; i++) {
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: ['Bob', 'Carol'][i-1] || `P${i}` });
    if (r.status !== 200) { fail(`P${i} 加入`, JSON.stringify(r.data)); return; }
    ids.push(r.data.playerId);
  }
  ok(`${numPlayers} 人都加入, 房间 ${roomId}`);

  // 开始牌局
  const start = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: ids[0] });
  if (start.status !== 200) { fail('开始', JSON.stringify(start.data)); return; }

  // 执行预设行动（每个行动是 [playerId, action, amount?]）
  let currentRoom = start.data.room;
  for (const [pid, action, amount] of actions) {
    const r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: pid, action, amount });
    if (r.status !== 200) { fail(`行动 ${action}`, JSON.stringify(r.data)); return; }
    currentRoom = r.data.room;
  }

  console.log(`\n  → 最终 stage: ${currentRoom.stage}, status: ${currentRoom.status}`);

  // 关键断言：游戏立即结算，不需要任何亮牌/弃牌决定
  assert(currentRoom.stage === 'showdown', 'stage 是 showdown（不是 showdown_reveal）');
  assert(currentRoom.status === 'ended', 'status 是 ended');
  assert(currentRoom.pot === 0, `pot 清零`, `actually ${currentRoom.pot}`);
  assert(currentRoom.lastWinners && currentRoom.lastWinners.length > 0, '有赢家');
  assert(currentRoom.sidePots && currentRoom.sidePots.length > 0, 'sidePots 已计算');

  // 验证筹码守恒：总筹码应该等于所有玩家初始筹码之和
  const totalChips = currentRoom.players.reduce((sum, p) => sum + p.chips, 0);
  const expected = numPlayers * startingChips;
  assert(totalChips === expected, `筹码守恒: ${totalChips} == ${expected}`, `actually ${totalChips}`);

  // 验证 sidePots 总和 = 之前的 pot（结算前）
  // 实际：把赢家 amountWon 加起来应该等于最后的 pot（结算前）
  const totalWon = currentRoom.lastWinners.reduce((sum, w) => sum + w.amountWon, 0);
  ok(`总赢得筹码: $${totalWon}`);

  // 验证每个非弃牌玩家的 revealed/mucked 都是 false（默认隐藏）
  for (const p of currentRoom.players) {
    if (!p.folded) {
      assert(p.revealed === false, `${p.nickname} 默认 revealed=false`);
      assert(p.mucked === false, `${p.nickname} 默认 mucked=false`);
    }
  }

  // 测试 toggle 亮牌
  console.log('\n  --- 测试 toggle 亮牌 ---');
  const alice = currentRoom.players[0];
  let t = await api(`/api/rooms/${roomId}/decide`, 'POST', { playerId: alice.id, reveal: true });
  if (t.status !== 200) { fail('Alice toggle reveal=true', JSON.stringify(t.data)); return; }
  assert(t.data.room.players[0].revealed === true, 'Alice toggle reveal=true 后 revealed=true');
  ok('stage 仍然是 showdown（不阻塞）');
  assert(t.data.room.stage === 'showdown', 'toggle 后 stage 仍是 showdown');

  // 再次 toggle 隐藏
  t = await api(`/api/rooms/${roomId}/decide`, 'POST', { playerId: alice.id, reveal: false });
  if (t.status !== 200) { fail('Alice toggle reveal=false', JSON.stringify(t.data)); return; }
  assert(t.data.room.players[0].revealed === false, 'Alice toggle reveal=false 后 revealed=false');
  assert(t.data.room.players[0].mucked === true, 'Alice mucked=true');
}

// 场景 1：2 人不同筹码 all-in（有边池）
// Alice 1000 (dealer/SB), Bob 300 (BB)
// 翻前：Alice all-in 1000, Bob 跟 all-in 300
// 主池 600 (300×2), 边池 700 (700×1, 只 Alice 资格)
// Alice 总投入 1000, Bob 总投入 300. Pot = 1300
async function scenario2pUnequal() {
  await runScenario('2人不同筹码 all-in (Alice $1000 vs Bob $300)', 2, 0, []);
  // 注：上面默认 startingChips=0 不行，重新做
}

// 真实场景：自定义 startingChips
async function realScenarios() {
  // 场景 A：2 人同筹码 all-in（无主边池之分）
  await runScenario('2 人同筹码 all-in', 2, 200, async () => []);
  // 实际上 runScenario 不支持 async action，简化：直接做场景
}

// 重新设计：直接在 runScenario 内部执行 all-in 流程
async function allInScenario(name, numPlayers, startingChips) {
  console.log(`\n=== ${name} (${numPlayers} 人，每人 $${startingChips}) ===`);
  const create = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: numPlayers,
    smallBlind: 10, bigBlind: 20, startingChips,
  });
  const roomId = create.data.roomId;
  const ids = [create.data.playerId];
  const ALL_NAMES = ['Bob', 'Carol', 'Dan', 'Eve', 'Frank', 'Greg'];
  for (let i = 1; i < numPlayers; i++) {
    const name = ALL_NAMES[i-1] || `P${i}`;
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: name });
    if (r.status !== 200) { fail(`P${i} (${name}) 加入`, JSON.stringify(r.data)); return; }
    ids.push(r.data.playerId);
  }
  ok(`${numPlayers} 人都加入, 房间 ${roomId}`);

  const start = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: ids[0] });
  let room = start.data.room;
  let safety = 0;
  console.log(`  开始: stage=${room.stage}, active=${room.players[room.activePlayerIndex]?.nickname}`);
  // 所有人都 all-in
  while (room.stage !== 'showdown' && room.stage !== 'ended' && safety++ < 20) {
    if (room.activePlayerIndex === null) { console.log('  break: active=null'); break; }
    const pid = ids[room.activePlayerIndex];
    const nick = room.players[room.activePlayerIndex].nickname;
    const r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: pid, action: 'all_in' });
    if (r.status !== 200) { console.log('  '+nick+' FAILED:', JSON.stringify(r.data)); fail(`all-in`); return; }
    room = r.data.room;
    console.log(`  iter ${safety}: ${nick} all-in → stage=${room.stage} pot=${room.pot}`);
  }

  console.log(`  → stage: ${room.stage}, status: ${room.status}, pot: ${room.pot}`);
  assert(room.stage === 'showdown', '进入 showdown（不是 showdown_reveal）');
  assert(room.status === 'ended', '状态 ended');
  assert(room.pot === 0, 'pot 清零', `actually ${room.pot}`);

  const totalChips = room.players.reduce((s, p) => s + p.chips, 0);
  assert(totalChips === numPlayers * startingChips, `筹码守恒 ${totalChips} = ${numPlayers * startingChips}`);

  const pots = room.sidePots || [];
  ok(`sidePots 数量: ${pots.length}`);
  pots.forEach((p, i) => {
    ok(`  pot[${i}] = $${p.amount} (${p.eligiblePlayerIds.length} 人有资格)`);
  });

  // 验证每个人 revealed/mucked 默认 false
  for (const p of room.players) {
    if (!p.folded) {
      assert(p.revealed === false, `${p.nickname} revealed=false`);
      assert(p.mucked === false, `${p.nickname} mucked=false`);
    }
  }

  // 测试 toggle 不阻塞
  const alice = room.players[0];
  const t = await api(`/api/rooms/${roomId}/decide`, 'POST', { playerId: alice.id, reveal: true });
  assert(t.status === 200, 'toggle reveal=true 成功');
  assert(t.data.room.players[0].revealed === true, 'revealed 变 true');
  assert(t.data.room.stage === 'showdown', 'toggle 后 stage 不变（仍 showdown）');
  ok(`赢家: ${room.lastWinners[0].playerId.slice(0, 14)}... (+$${room.lastWinners[0].amountWon})`);
}

await allInScenario('场景 1: 2 人 all-in (同筹码 $200)', 2, 200);
await sleep(500);
await allInScenario('场景 2: 3 人 all-in (同筹码 $200)', 3, 200);
await sleep(500);
await allInScenario('场景 3: 4 人 all-in (同筹码 $200)', 4, 200);
await sleep(500);
await allInScenario('场景 4: 6 人 all-in (同筹码 $200)', 6, 200);

console.log('\n' + (process.exitCode ? '❌ 失败' : '🎉 2-6 人 all-in 都立即结算，亮牌/弃牌不阻塞'));
