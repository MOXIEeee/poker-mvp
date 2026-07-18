// Side Pot 算法测试
import { calculateSidePots } from './lib/game.ts';
import { evaluateHand } from './lib/hand.ts';

function c(suit, rank) { return { suit, rank }; }
function p(id, name, totalBetThisHand, holeCards) {
  return {
    player: {
      id, nickname: name, chips: 0, holeCards, currentBet: 0, totalBetThisHand,
      folded: false, allIn: true, isDealer: false, isSmallBlind: false, isBigBlind: false,
      hasActed: true, connected: true, lastHeartbeat: Date.now(),
    },
    hand: { rank: 'high_card', score: 0, bestFive: [], description: '' },
  };
}

// 真实 evaluateHand 包装
function evalPlayer(id, name, totalBetThisHand, holeCards, community) {
  return {
    player: {
      id, nickname: name, chips: 0, holeCards, currentBet: 0, totalBetThisHand,
      folded: false, allIn: true, isDealer: false, isSmallBlind: false, isBigBlind: false,
      hasActed: true, connected: true, lastHeartbeat: Date.now(),
    },
    hand: evaluateHand([...holeCards, ...community]),
  };
}

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

// ==================== 单元测试：calculateSidePots ====================

console.log('--- calculateSidePots 单元测试 ---\n');

// 场景 1：3 人不同 all-in 额
{
  const players = [
    p('a', 'Alice', 100, []),
    p('b', 'Bob', 200, []),
    p('c', 'Carol', 200, []),
  ];
  const pots = calculateSidePots(players);
  console.log('场景 1: Alice 100, Bob 200, Carol 200');
  console.log('  结果:', pots);
  assert('主池金额 300', pots[0].amount, 300);
  assert('边池 1 金额 200', pots[1].amount, 200);
  assert('主池有 3 人资格', pots[0].eligiblePlayerIds.length, 3);
  assert('边池 1 有 2 人资格', pots[1].eligiblePlayerIds.length, 2);
  assert('边池 1 不含 Alice', pots[1].eligiblePlayerIds.includes('a'), false);
}

// 场景 2：4 人不同 all-in 额
{
  const players = [
    p('a', 'Alice', 50, []),
    p('b', 'Bob', 100, []),
    p('c', 'Carol', 200, []),
    p('d', 'Dave', 500, []),
  ];
  const pots = calculateSidePots(players);
  console.log('\n场景 2: Alice 50, Bob 100, Carol 200, Dave 500');
  console.log('  结果:', pots);
  assert('有 4 个池', pots.length, 4);
  assert('池 1: 50*4=200', pots[0].amount, 200);
  assert('池 2: 50*3=150', pots[1].amount, 150);
  assert('池 3: 100*2=200', pots[2].amount, 200);
  assert('池 4: 300*1=300', pots[3].amount, 300);
  // 总和应该 = 50+100+200+500 = 850
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert('总和 = 850', total, 850);
}

// 场景 3：所有玩家相同 all-in 额（一个池）
{
  const players = [
    p('a', 'Alice', 100, []),
    p('b', 'Bob', 100, []),
    p('c', 'Carol', 100, []),
  ];
  const pots = calculateSidePots(players);
  console.log('\n场景 3: 三人都 100');
  assert('只有 1 个池', pots.length, 1);
  assert('池金额 300', pots[0].amount, 300);
}

// 场景 4：2 人不同额
{
  const players = [
    p('a', 'Alice', 100, []),
    p('b', 'Bob', 300, []),
  ];
  const pots = calculateSidePots(players);
  console.log('\n场景 4: Alice 100, Bob 300');
  assert('主池 100*2=200', pots[0].amount, 200);
  assert('边池 200*1=200', pots[1].amount, 200);
  assert('边池只有 Bob', pots[1].eligiblePlayerIds, ['b']);
}

// 场景 5：玩家 bet = 0
{
  const players = [
    p('a', 'Alice', 0, []),
    p('b', 'Bob', 100, []),
  ];
  const pots = calculateSidePots(players);
  console.log('\n场景 5: Alice 0, Bob 100');
  assert('主池 100 (只有 Bob 的 100)', pots[0].amount, 100);
  assert('Alice 在主池没资格', pots[0].eligiblePlayerIds, ['b']);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
