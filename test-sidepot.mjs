// Side Pot 算法测试
import { calculateSidePots } from './lib/game.ts';
import { evaluateHand } from './lib/hand.ts';

function c(suit, rank) { return { suit, rank }; }

// 5 张虚拟公共牌（用于 evaluateHand）
const DUMMY_COMMUNITY = [c('♠', '2'), c('♥', '3'), c('♦', '4'), c('♣', '5'), c('♠', '6')];

// 一个 active player (没弃牌)
function activePlayer(id, name, totalBetThisHand, holeCards) {
  return {
    id, nickname: name, chips: 0, holeCards, currentBet: 0, totalBetThisHand,
    folded: false, allIn: true, isDealer: false, isSmallBlind: false, isBigBlind: false,
    hasActed: true, connected: true, lastHeartbeat: Date.now(),
    revealed: false, mucked: false,
  };
}

// 一个 folded player (弃牌了)
function foldedPlayer(id, name, totalBetThisHand) {
  return {
    id, nickname: name, chips: 0, holeCards: [], currentBet: 0, totalBetThisHand,
    folded: true, allIn: false, isDealer: false, isSmallBlind: false, isBigBlind: false,
    hasActed: true, connected: true, lastHeartbeat: Date.now(),
    revealed: false, mucked: false,
  };
}

// 构造 evaluated (只含 active)
function evalPlayer(player) {
  return {
    player,
    hand: evaluateHand([...player.holeCards, ...DUMMY_COMMUNITY]),
  };
}

let pass = 0, fail = 0;
function assert(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`✓ ${name}`); }
  else {
    fail++;
    console.log(`✗ ${name}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// ==================== 单元测试：calculateSidePots ====================

console.log('--- calculateSidePots 单元测试 (新版：含死钱) ---\n');

// 场景 1：3 人不同 all-in 额 (无人弃牌)
{
  const a = activePlayer('a', 'Alice', 100, []);
  const b = activePlayer('b', 'Bob', 200, []);
  const c = activePlayer('c', 'Carol', 200, []);
  const evaluated = [evalPlayer(a), evalPlayer(b), evalPlayer(c)];
  const pots = calculateSidePots(evaluated, [a, b, c]);
  console.log('场景 1: Alice 100, Bob 200, Carol 200 (无人弃牌)');
  assert('主池金额 300', pots[0].amount, 300);
  assert('边池 1 金额 200', pots[1].amount, 200);
  assert('主池有 3 人资格', pots[0].eligiblePlayerIds.length, 3);
  assert('边池 1 有 2 人资格', pots[1].eligiblePlayerIds.length, 2);
}

// 场景 2：4 人不同 all-in 额
{
  const players = [
    activePlayer('a', 'Alice', 50, []),
    activePlayer('b', 'Bob', 100, []),
    activePlayer('c', 'Carol', 200, []),
    activePlayer('d', 'Dave', 500, []),
  ];
  const evaluated = players.map(evalPlayer);
  const pots = calculateSidePots(evaluated, players);
  console.log('\n场景 2: Alice 50, Bob 100, Carol 200, Dave 500 (无人弃牌)');
  assert('有 4 个池', pots.length, 4);
  assert('池 1: 50*4=200', pots[0].amount, 200);
  assert('池 2: 50*3=150', pots[1].amount, 150);
  assert('池 3: 100*2=200', pots[2].amount, 200);
  assert('池 4: 300*1=300', pots[3].amount, 300);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert('总和 = 850', total, 850);
}

// 场景 3：所有玩家相同 all-in 额（一个池）
{
  const players = [
    activePlayer('a', 'Alice', 100, []),
    activePlayer('b', 'Bob', 100, []),
    activePlayer('c', 'Carol', 100, []),
  ];
  const evaluated = players.map(evalPlayer);
  const pots = calculateSidePots(evaluated, players);
  console.log('\n场景 3: 三人都 100');
  assert('只有 1 个池', pots.length, 1);
  assert('池金额 300', pots[0].amount, 300);
}

// 场景 4：2 人不同额
{
  const players = [
    activePlayer('a', 'Alice', 100, []),
    activePlayer('b', 'Bob', 300, []),
  ];
  const evaluated = players.map(evalPlayer);
  const pots = calculateSidePots(evaluated, players);
  console.log('\n场景 4: Alice 100, Bob 300');
  assert('主池 100*2=200', pots[0].amount, 200);
  assert('边池 200*1=200', pots[1].amount, 200);
  assert('边池只有 Bob', pots[1].eligiblePlayerIds, ['b']);
}

// 场景 5：玩家 bet = 0 (没投钱)
{
  const a = activePlayer('a', 'Alice', 0, []);
  const b = activePlayer('b', 'Bob', 100, []);
  const evaluated = [evalPlayer(a), evalPlayer(b)];
  const pots = calculateSidePots(evaluated, [a, b]);
  console.log('\n场景 5: Alice 0, Bob 100');
  assert('主池 100 (只有 Bob 的 100)', pots[0].amount, 100);
  assert('Alice 在主池没资格', pots[0].eligiblePlayerIds, ['b']);
}

// ========== 关键场景：死钱 (folded player 投的钱要进主池) ==========

// 场景 6：3 人 100 筹码，Carol (BB) 投 20 后弃牌，Alice 50, Bob 50
// pot 应该是 120 (20 Carol BB + 50 Alice + 50 Bob)
{
  const alice = activePlayer('a', 'Alice', 50, []);
  const bob = activePlayer('b', 'Bob', 50, []);
  const carol = foldedPlayer('c', 'Carol', 20); // 投了 BB 20 然后弃牌
  const evaluated = [evalPlayer(alice), evalPlayer(bob)];
  const pots = calculateSidePots(evaluated, [alice, bob, carol]);
  console.log('\n场景 6: Alice 50, Bob 50, Carol 20 (folded, 死钱)');
  console.log('  结果:', JSON.stringify(pots));
  // 旧 bug: 算 100 (漏算 Carol 20)
  // 修复: 主池 20*3=60, 边池 30*2=60, 总 120
  assert('主池 20*3=60 (含 Carol 死钱)', pots[0].amount, 60);
  assert('主池 3 人贡献 (Alice, Bob, Carol)', pots[0].eligiblePlayerIds.length, 2); // eligible 只算 active
  assert('主池 eligible 是 Alice 和 Bob', pots[0].eligiblePlayerIds.sort(), ['a', 'b']);
  assert('边池 30*2=60', pots[1].amount, 60);
  assert('边池 eligible 是 Alice 和 Bob', pots[1].eligiblePlayerIds.sort(), ['a', 'b']);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert('总 pot = 120 (含死钱)', total, 120);
}

// 场景 7：4 人，Bob 投 50 后弃牌，其他人都 200
// pot = 50 (Bob 死钱) + 200*3 = 650
{
  const alice = activePlayer('a', 'Alice', 200, []);
  const bob = foldedPlayer('b', 'Bob', 50);
  const carol = activePlayer('c', 'Carol', 200, []);
  const dan = activePlayer('d', 'Dan', 200, []);
  const evaluated = [evalPlayer(alice), evalPlayer(carol), evalPlayer(dan)];
  const pots = calculateSidePots(evaluated, [alice, bob, carol, dan]);
  console.log('\n场景 7: Alice/Carol/Dan 都 200, Bob 50 (folded)');
  console.log('  结果:', JSON.stringify(pots));
  // 主池 50*4=200 (含 Bob 死钱)
  // 边池 150*3=450
  // 总 = 650
  assert('主池 50*4=200', pots[0].amount, 200);
  assert('主池 eligible 3 人 (不含 Bob)', pots[0].eligiblePlayerIds.length, 3);
  assert('主池不含 Bob', pots[0].eligiblePlayerIds.includes('b'), false);
  assert('边池 150*3=450', pots[1].amount, 450);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert('总 pot = 650', total, 650);
}

// 场景 8：多人弃牌的复杂场景
// Alice 50, Bob 30 (fold), Carol 50, Dan 20 (fold)
// pot = 50+30+50+20 = 150
{
  const alice = activePlayer('a', 'Alice', 50, []);
  const bob = foldedPlayer('b', 'Bob', 30);
  const carol = activePlayer('c', 'Carol', 50, []);
  const dan = foldedPlayer('d', 'Dan', 20);
  const evaluated = [evalPlayer(alice), evalPlayer(carol)];
  const pots = calculateSidePots(evaluated, [alice, bob, carol, dan]);
  console.log('\n场景 8: Alice 50, Bob 30 (fold), Carol 50, Dan 20 (fold)');
  console.log('  结果:', JSON.stringify(pots));
  // 主池 20*4=80 (含 Bob 30 + Dan 20 死钱)
  // 边池 10*3=30 (Alice, Bob, Carol 投到 30, Dan 只有 20)
  // 边池 20*2=40 (Alice, Carol 投到 50)
  // 总 = 80+30+40 = 150
  assert('主池 20*4=80', pots[0].amount, 80);
  assert('主池 eligible 2 人 (Alice, Carol)', pots[0].eligiblePlayerIds.sort(), ['a', 'c']);
  assert('边池 10*3=30', pots[1].amount, 30);
  assert('边池 eligible 2 人', pots[1].eligiblePlayerIds.sort(), ['a', 'c']);
  assert('边池 2 20*2=40', pots[2].amount, 40);
  assert('边池 2 eligible 2 人', pots[2].eligiblePlayerIds.sort(), ['a', 'c']);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert('总 pot = 150', total, 150);
}

// 场景 9：active 玩家全 0 chips (all-in for 0), 1 folded 投了 43
// 死钱 43 应该归 main pot, 5 active 玩家平分
{
  const alice = activePlayer('a', 'Alice', 0, []);
  const bob = activePlayer('b', 'Bob', 0, []);
  const carol = activePlayer('c', 'Carol', 0, []);
  const dan = activePlayer('d', 'Dan', 0, []);
  const eve = foldedPlayer('e', 'Eve', 43);
  const frank = activePlayer('f', 'Frank', 0, []);
  const evaluated = [evalPlayer(alice), evalPlayer(bob), evalPlayer(carol), evalPlayer(dan), evalPlayer(frank)];
  const pots = calculateSidePots(evaluated, [alice, bob, carol, dan, eve, frank]);
  console.log('\n场景 9: 5 active (0 totalBet) + 1 folded (43 totalBet)');
  console.log('  结果:', JSON.stringify(pots));
  // 死钱 43 归 main pot, 5 active 玩家平分
  assert('1 个 pot', pots.length, 1);
  assert('pot 金额 43 (死钱)', pots[0].amount, 43);
  assert('eligible 5 个 active', pots[0].eligiblePlayerIds.length, 5);
}

// 场景 10：active 玩家 + 多个 folded 投了不同额
// Alice 100 (active), Bob 200 (fold), Carol 200 (fold)
// pot = 100 + 200 + 200 = 500
// 100 在 main pot (3 人投), 300 在死钱 (Bob/Carol excess)
// Bob/Carol 各 100 在 main pot, 各 100 死钱
// 最终 Alice 拿 500 (main pot 300 + 死钱 200)
{
  const alice = activePlayer('a', 'Alice', 100, []);
  const bob = foldedPlayer('b', 'Bob', 200);
  const carol = foldedPlayer('c', 'Carol', 200);
  const evaluated = [evalPlayer(alice)];
  const pots = calculateSidePots(evaluated, [alice, bob, carol]);
  console.log('\n场景 10: 1 active (100) + 2 folded (200 each)');
  console.log('  结果:', JSON.stringify(pots));
  // levels=[100, 200]
  // level=100: contributors=3, eligible=[Alice]. pot=300.
  // level=200: contributors=2, eligible=[]. deadMoney=200.
  // After loop: deadMoney=200, add to last pot → pot=500.
  assert('1 个 pot', pots.length, 1);
  assert('pot 金额 500', pots[0].amount, 500);
  assert('eligible 只有 Alice', pots[0].eligiblePlayerIds, ['a']);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
