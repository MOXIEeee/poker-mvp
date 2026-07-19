// 探测筹码守恒 bug
// 跑 N 手，每手结算后验证：所有玩家筹码 + pot = 初始总筹码
const BASE = 'https://poker-mvp-liart.vercel.app';

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

function ok(n) { console.log(`  ✓ ${n}`); }
function fail(n, m) { console.log(`  ❌ ${n}: ${m}`); process.exitCode = 1; }
function assert(c, n, d) { c ? ok(n) : fail(n, d || '断言失败'); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 模拟 3 人 1000 筹码：
// - Carol 是 BB, 投了 20 后弃牌
// - Alice (D, UTG) raise 50
// - Bob (SB) call
// - Alice 和 Bob 玩到河牌摊牌
// 期望：pot = 20 (Carol BB) + 50 (Alice raise) + 40 (Bob call 到 50, 含 SB 10) = 110
// sidePots 总和应该 = pot

async function deadMoneyTest() {
  console.log('\n=== 测试 1: 死钱 (folded player 的钱是否进主池) ===');

  const create = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: 3, smallBlind: 10, bigBlind: 20, startingChips: 1000,
  });
  const roomId = create.data.roomId;
  const aliceId = create.data.playerId;
  const bobJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Bob' });
  const bobId = bobJoin.data.playerId;
  const carolJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Carol' });
  const carolId = carolJoin.data.playerId;
  ok('3 人都加入');

  const start = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  let room = start.data.room;
  ok(`开始: dealer=${room.players.find(p => p.isDealer).nickname}, SB=${room.players.find(p => p.isSmallBlind).nickname}, BB=${room.players.find(p => p.isBigBlind).nickname}`);

  // 3 人: 0=D, 1=SB, 2=BB. 翻前: D(0) 先行动 (3 人无独立 UTG)
  // Alice (D) raise 50
  let r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: aliceId, action: 'raise', amount: 50 });
  assert(r.status === 200, 'Alice raise 50');
  room = r.data.room;
  ok(`  Alice raise 后 pot=${room.pot}, currentBet=${room.currentBet}`);

  // Bob (SB) call (跟 40)
  r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: bobId, action: 'call' });
  assert(r.status === 200, 'Bob call');
  room = r.data.room;
  ok(`  Bob call 后 pot=${room.pot}`);

  // Carol (BB) fold
  r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: carolId, action: 'fold' });
  assert(r.status === 200, 'Carol fold');
  room = r.data.room;
  ok(`  Carol fold 后 pot=${room.pot}`);

  // Alice 行动：应该轮到 Alice (因为 raise 重置了 hasActed)
  ok(`  现在轮: ${room.players[room.activePlayerIndex].nickname}`);
  if (room.activePlayerIndex !== null) {
    r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: aliceId, action: 'check' });
    if (r.status === 200) { room = r.data.room; ok(`  Alice check, stage=${room.stage}`); }
  }

  // Bob 翻后行动
  while (room.stage !== 'showdown' && room.stage !== 'ended' && room.activePlayerIndex !== null) {
    const activePlayer = room.players[room.activePlayerIndex];
    r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: activePlayer.id, action: 'check' });
    if (r.status !== 200) { fail(`check by ${activePlayer.nickname}`, JSON.stringify(r.data)); return; }
    room = r.data.room;
    if (room.activePlayerIndex === null) break;
  }

  console.log(`\n  → stage=${room.stage}, pot=${room.pot}, status=${room.status}`);
  if (room.sidePots) {
    console.log(`  sidePots (${room.sidePots.length} 个):`);
    room.sidePots.forEach((p, i) => {
      const elig = p.eligiblePlayerIds.map(id => room.players.find(pl => pl.id === id)?.nickname).join(',');
      console.log(`    pot[${i}] = $${p.amount} (eligible: ${elig})`);
    });
  }

  const totalChips = room.players.reduce((s, p) => s + p.chips, 0) + room.pot;
  const expected = 3 * 1000;
  console.log(`  总筹码 (含 pot): ${totalChips} = ? 应为 ${expected}`);

  const sidePotsTotal = (room.sidePots || []).reduce((s, p) => s + p.amount, 0);
  console.log(`  sidePots 总和: ${sidePotsTotal}, pot (结算前): ${room.pot}`);

  if (room.stage === 'showdown' || room.stage === 'ended') {
    assert(totalChips === expected, `筹码守恒 ${totalChips} = ${expected}`);
    assert(sidePotsTotal === 0, `sidePots 应该被赢家拿走 (pot 清零)`, `actually ${sidePotsTotal}`);
  }
}

await deadMoneyTest();
