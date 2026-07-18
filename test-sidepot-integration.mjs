// 集成测试：完整跑一局 3 人 all-in 不同额
import { calculateSidePots, createRoom, joinRoom, startHandByHost, processAction, getRoom } from './lib/game.ts';
import { evaluateHand } from './lib/hand.ts';

function c(suit, rank) { return { suit, rank }; }
const S = Suit => c(Suit);

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// ==================== 完整一局：3 人不同 all-in 额 ====================

console.log('--- 3 人不同 all-in 额：Alice 100, Bob 200, Carol 200 ---');

// 创建房间
const settings = {
  maxPlayers: 3, smallBlind: 5, bigBlind: 10, startingChips: 1000, password: '',
};
const room = createRoom(settings, 'Alice');
const aliceId = room.players[0].id;

const bRes = joinRoom(room.id, '', 'Bob');
const bobId = bRes.playerId;
const cRes = joinRoom(room.id, '', 'Carol');
const carolId = cRes.playerId;

// 修改 Alice 和 Bob 的筹码（Carol 保持 1000）
room.players.find(p => p.id === aliceId).chips = 100;
room.players.find(p => p.id === bobId).chips = 200;

console.log(`Alice 起始筹码: ${room.players.find(p => p.id === aliceId).chips}`);
console.log(`Bob 起始筹码: ${room.players.find(p => p.id === bobId).chips}`);
console.log(`Carol 起始筹码: ${room.players.find(p => p.id === carolId).chips}`);

// 开始牌局
startHandByHost(room, aliceId);
console.log(`\n牌局开始，stage: ${room.stage}, pot: ${room.pot}`);

// 模拟：所有人都 raise to 200（超过自己筹码的自动 all-in）
// 当前 active 玩家
async function act(playerId, action, amount) {
  return processAction(room, playerId, action, amount);
}

// 找到 active 玩家
function getActive() {
  if (room.activePlayerIndex === null) return null;
  return room.players[room.activePlayerIndex];
}

let safety = 20;
while (safety-- > 0) {
  const active = getActive();
  if (!active) {
    if (room.status === 'ended') break;
    await new Promise(r => setTimeout(r, 10));
    continue;
  }
  // 玩家 raise to 200（Alice 只有 100，会 all-in 100）
  const r = await act(active.id, 'raise', 200);
  if (r.error) {
    console.log(`  ${active.nickname} action err: ${r.error}`);
    break;
  }
  console.log(`  ${active.nickname} raise 200 → chips ${active.chips}, totalBet ${active.totalBetThisHand}, allIn ${active.allIn}`);
  await new Promise(r => setTimeout(r, 5));
}

console.log(`\n牌局状态: ${room.status}, stage: ${room.stage}, pot: ${room.pot}`);
console.log(`\n边池明细:`);
room.sidePots?.forEach((p, i) => {
  console.log(`  池 ${i}: $${p.amount}, 资格: ${p.eligiblePlayerIds.map(id => room.players.find(p => p.id === id)?.nickname).join(', ')}`);
});
console.log(`\n赢家:`);
room.lastWinners?.forEach(w => {
  const p = room.players.find(p => p.id === w.playerId);
  console.log(`  ${p.nickname} +$${w.amountWon} (${w.hand.description})`);
});

console.log(`\n各玩家筹码:`);
room.players.forEach(p => console.log(`  ${p.nickname}: $${p.chips}`));

// 验证
const totalChips = room.players.reduce((s, p) => s + p.chips, 0);
console.log(`\n总筹码: ${totalChips} (应该 1300 = 100+200+1000)`);
assert('总筹码守恒 1300', totalChips, 1300);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
