// 验证不同筹码的 all-in 真的会产生主池 + 边池，并正确结算
// 2 人：Alice $1000, Bob $300
// 翻前 Alice all-in $1000, Bob all-in $300
// 预期：主池 $600 (300×2 都有资格) + 边池 $700 (700×1 只 Alice 资格)

const BASE = 'https://poker-mvp-liart.vercel.app';
const api = async (p, m = 'GET', b) => {
  const r = await fetch(BASE + p, {
    method: m, headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (n) => console.log(`  ✓ ${n}`);
const fail = (n, m) => { console.log(`  ❌ ${n}: ${m}`); process.exitCode = 1; };
const assert = (c, n, d) => c ? ok(n) : fail(n, d || '断言失败');

console.log('=== 2 人不同筹码 all-in: Alice $1000 vs Bob $300 ===');
// Alice 是房主，$1000
const c = await api('/api/rooms', 'POST', {
  nickname: 'Alice', maxPlayers: 2, smallBlind: 10, bigBlind: 20, startingChips: 1000,
});
const roomId = c.data.roomId;
const aliceId = c.data.playerId;
// Bob 加入，$300
const bj = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Bob', startingChips: 300 });
if (bj.status !== 200) { fail('Bob join', JSON.stringify(bj.data)); process.exit(1); }
const bobId = bj.data.playerId;
ok(`房间 ${roomId}, Alice=$1000, Bob=$300`);

const start = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
let room = start.data.room;
ok(`开始: dealer=${room.players.find(p => p.isDealer).nickname}, SB=${room.players.find(p => p.isSmallBlind).nickname}`);

// Alice 翻前 all-in
let r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: aliceId, action: 'all_in' });
assert(r.status === 200, 'Alice all-in');
room = r.data.room;
ok(`Alice all-in: pot=${room.pot}, currentBet=${room.currentBet}, totalBet=${room.players[0].totalBetThisHand}`);

// Bob 跟 (call 即可，因为他只能 call 到底)
r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: bobId, action: 'all_in' });
assert(r.status === 200, 'Bob all-in');
room = r.data.room;
ok(`Bob all-in: pot=${room.pot}, totalBet=${room.players[1].totalBetThisHand}`);

console.log(`\n→ 最终 stage=${room.stage}, status=${room.status}, pot=${room.pot}`);
assert(room.stage === 'showdown', '进入 showdown');
assert(room.status === 'ended', 'ended');
assert(room.pot === 0, 'pot 清零');

const totalChips = room.players.reduce((s, p) => s + p.chips, 0);
const expected = 1000 + 300;
assert(totalChips === expected, `筹码守恒 ${totalChips} = ${expected}`);

const pots = room.sidePots || [];
console.log(`\n  sidePots (${pots.length} 个):`);
pots.forEach((p, i) => {
  const elig = p.eligiblePlayerIds.map(id => room.players.find(pl => pl.id === id)?.nickname).join(' / ');
  console.log(`    pot[${i}] = $${p.amount} (${elig})`);
});

// 主池：300×2 = $600，两人都资格
// 边池：700×1 = $700，只 Alice 资格
assert(pots.length === 2, `sidePots 数量 = 2 (主池 + 边池)`, `actually ${pots.length}`);
assert(pots[0].amount === 600, `主池 $600`, `actually ${pots[0].amount}`);
assert(pots[0].eligiblePlayerIds.length === 2, '主池两人都资格');
assert(pots[1].amount === 700, `边池 $700`, `actually ${pots[1].amount}`);
assert(pots[1].eligiblePlayerIds.length === 1, '边池只 Alice 资格');
assert(pots[1].eligiblePlayerIds[0] === aliceId, '边池只 Alice 有资格');

// 验证赢家（Alice 牌应该更好但也可能输）
const winnerIds = room.lastWinners.map(w => w.playerId);
console.log(`\n  赢家: ${room.lastWinners.map(w => {
  const p = room.players.find(pl => pl.id === w.playerId);
  return `${p.nickname} (${w.hand.description}) +$${w.amountWon}`;
}).join(' | ')}`);

const totalWon = room.lastWinners.reduce((s, w) => s + w.amountWon, 0);
assert(totalWon === 1300, `总赢得 $1300`, `actually ${totalWon}`);

console.log(process.exitCode ? '\n❌ 失败' : '\n🎉 边池正确生成并结算');
