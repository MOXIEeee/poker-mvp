// 综合牌型判定测试
import { evaluateHand } from './lib/hand.ts';

function c(suit, rank) { return { suit, rank }; }

const tests = [
  // 1. 皇家同花顺
  {
    name: '皇家同花顺 (10-J-Q-K-A 同花)',
    seven: [c('♠', 'A'), c('♠', 'K'), c('♠', 'Q'), c('♠', 'J'), c('♠', 'T'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'royal_flush', high: 14 },
  },
  // 2. 同花顺
  {
    name: 'K-high 同花顺 (9-10-J-Q-K 同花)',
    seven: [c('♥', '9'), c('♥', 'T'), c('♥', 'J'), c('♥', 'Q'), c('♥', 'K'), c('♠', '2'), c('♦', '5')],
    expect: { rank: 'straight_flush', high: 13 },
  },
  {
    name: 'A-low 同花顺 (A-2-3-4-5 同花)',
    seven: [c('♦', 'A'), c('♦', '2'), c('♦', '3'), c('♦', '4'), c('♦', '5'), c('♠', 'K'), c('♣', 'Q')],
    expect: { rank: 'straight_flush', high: 5 },
  },
  // 3. 四条
  {
    name: '四条 A',
    seven: [c('♠', 'A'), c('♥', 'A'), c('♦', 'A'), c('♣', 'A'), c('♠', 'K'), c('♥', 'Q'), c('♦', '5')],
    expect: { rank: 'four_of_a_kind' },
  },
  // 4. 葫芦
  {
    name: '葫芦 A 带 K',
    seven: [c('♠', 'A'), c('♥', 'A'), c('♦', 'A'), c('♣', 'K'), c('♠', 'K'), c('♥', 'Q'), c('♦', '5')],
    expect: { rank: 'full_house' },
  },
  // 5. 同花
  {
    name: 'A-high 同花',
    seven: [c('♠', 'A'), c('♠', 'K'), c('♠', 'Q'), c('♠', 'J'), c('♠', '9'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'flush' },
  },
  // 6. 顺子 - 修复重点
  {
    name: 'A-high 顺子 (10-J-Q-K-A)',
    seven: [c('♠', 'A'), c('♥', 'K'), c('♦', 'Q'), c('♣', 'J'), c('♠', 'T'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'straight', high: 14 },
  },
  {
    name: '7-high 顺子 (3-4-5-6-7)',
    seven: [c('♠', '3'), c('♥', '4'), c('♦', '5'), c('♣', '6'), c('♠', '7'), c('♥', '2'), c('♦', 'A')],
    expect: { rank: 'straight', high: 7 },
  },
  {
    name: '5-high 顺子 (A-2-3-4-5)',
    seven: [c('♠', 'A'), c('♥', '2'), c('♦', '3'), c('♣', '4'), c('♠', '5'), c('♥', 'K'), c('♦', 'Q')],
    expect: { rank: 'straight', high: 5 },
  },
  // 7. 三条
  {
    name: '三条 A',
    seven: [c('♠', 'A'), c('♥', 'A'), c('♦', 'A'), c('♣', 'K'), c('♠', 'Q'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'three_of_a_kind' },
  },
  // 8. 两对
  {
    name: '两对 A 和 K',
    seven: [c('♠', 'A'), c('♥', 'A'), c('♦', 'K'), c('♣', 'K'), c('♠', 'Q'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'two_pair' },
  },
  // 9. 对子
  {
    name: '对子 A',
    seven: [c('♠', 'A'), c('♥', 'A'), c('♦', 'K'), c('♣', 'Q'), c('♠', 'J'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'pair' },
  },
  // 10. 高牌
  {
    name: 'A 高牌',
    seven: [c('♠', 'A'), c('♥', 'K'), c('♦', 'Q'), c('♣', 'J'), c('♠', '9'), c('♥', '2'), c('♦', '5')],
    expect: { rank: 'high_card' },
  },
];

let pass = 0, fail = 0;
for (const t of tests) {
  const result = evaluateHand(t.seven);
  let highOk = true;
  if (t.expect.high !== undefined) {
    // high 在 score 的 16^4 位置（因为 level 5 个 4-bit + kicker[0] 4-bit）
    const actualHigh = (result.score >> 16) & 0xf;
    highOk = actualHigh === t.expect.high;
  }
  const ok = result.rank === t.expect.rank && highOk;
  if (ok) {
    pass++;
    console.log(`✓ ${t.name} → ${result.rank} (${result.description})`);
  } else {
    fail++;
    console.log(`✗ ${t.name}`);
    console.log(`  expected: rank=${t.expect.rank}${t.expect.high ? `, high=${t.expect.high}` : ''}`);
    console.log(`  got:      rank=${result.rank}, score=${result.score} (0x${result.score.toString(16)}) (${result.description})`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);

// 顺子比较测试
console.log('\n--- 顺子比较测试 ---');
const straightTests = [
  { name: 'A-high 顺子', seven: [c('♠', 'A'), c('♥', 'K'), c('♦', 'Q'), c('♣', 'J'), c('♠', 'T'), c('♥', '2'), c('♦', '5')] },
  { name: 'K-high 顺子', seven: [c('♠', 'K'), c('♥', 'Q'), c('♦', 'J'), c('♣', 'T'), c('♠', '9'), c('♥', '2'), c('♦', '5')] },
  { name: '5-high 顺子 (A-low)', seven: [c('♠', 'A'), c('♥', '2'), c('♦', '3'), c('♣', '4'), c('♠', '5'), c('♥', 'K'), c('♦', 'Q')] },
  { name: '6-high 顺子', seven: [c('♠', '2'), c('♥', '3'), c('♦', '4'), c('♣', '5'), c('♠', '6'), c('♥', 'K'), c('♦', 'Q')] },
  { name: '7-high 顺子', seven: [c('♠', '3'), c('♥', '4'), c('♦', '5'), c('♣', '6'), c('♠', '7'), c('♥', 'K'), c('♦', 'Q')] },
];

const evaluated = straightTests.map(t => ({ name: t.name, ...evaluateHand(t.seven) }));
evaluated.sort((a, b) => b.score - a.score);
console.log('按强度从大到小：');
evaluated.forEach((e, i) => {
  console.log(`  ${i + 1}. ${e.name} (score=${e.score})`);
});

const expectedOrder = ['A-high 顺子', 'K-high 顺子', '7-high 顺子', '6-high 顺子', '5-high 顺子 (A-low)'];
const actualOrder = evaluated.map(e => e.name);
const orderOk = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);
console.log(orderOk ? '✓ 顺子顺序正确' : '✗ 顺子顺序错误');
console.log('  期望:', expectedOrder);
console.log('  实际:', actualOrder);

// 真实对局场景：多玩家比牌
console.log('\n--- 多玩家比牌测试 ---');
const community = [c('♠', 'A'), c('♠', 'K'), c('♠', 'Q'), c('♠', 'J'), c('♠', '9')]; // 同花 A K Q J 9
const players = [
  { name: 'Alice', hand: [c('♥', 'T'), c('♥', 'T')] }, // 对子 T (T 高牌，剩 K Q J 9 kicker)
  { name: 'Bob', hand: [c('♣', 'A'), c('♦', '2')] },     // 对子 A
  { name: 'Carol', hand: [c('♦', 'K'), c('♥', '5')] },   // 对子 K
  { name: 'Dave', hand: [c('♣', 'Q'), c('♥', '7')] },    // 对子 Q
];

const results = players.map(p => ({
  ...p,
  eval: evaluateHand([...p.hand, ...community]),
}));
results.sort((a, b) => b.eval.score - a.eval.score);
console.log('按牌力从大到小：');
results.forEach((r, i) => {
  console.log(`  ${i + 1}. ${r.name}: ${r.eval.description} (score=${r.eval.score})`);
});
const winner = results[0].name;
console.log(`赢家：${winner}`);

// Alice 应该是葫芦 A 带 T (A♠ K♠ Q♠ J♠ 9♠ + T♥ T♦ → A♠ A♥? 没有。让我再算: Alice 手牌 T♥ T♦，公共牌 A♠ K♠ Q♠ J♠ 9♠，选 5 张 = T♥ T♦ A♠ K♠ Q♠ → 对子 T 不是葫芦)
// 重新算 Alice: 5 张 = A♠ K♠ Q♠ J♠ T♥ → A-high 顺子 (不是同花，因为 T♥ 不是黑桃) → A-high 顺子
// Bob 手牌 A♣ 2♦，选 5 张 = A♠ A♣ K♠ Q♠ J♠ → 对子 A
// Carol 手牌 K♦ 5♥，选 5 张 = A♠ K♠ K♦ Q♠ J♠ → 对子 K
// Dave 手牌 Q♣ 7♥，选 5 张 = A♠ K♠ Q♠ Q♣ J♠ → 对子 Q

// 所以 Alice A-high 顺子 > Bob 对子 A > Carol 对子 K > Dave 对子 Q
const expectedWinner = 'Alice';
console.log(winner === expectedWinner ? `✓ 多玩家比牌正确 (${expectedWinner} 赢)` : `✗ 错误，期望 ${expectedWinner} 赢`);

// 同花 vs 顺子：同花应该比普通顺子强
console.log('\n--- 同花 vs 顺子 ---');
const flushSeven = [c('♠', '2'), c('♠', '3'), c('♠', '4'), c('♠', '5'), c('♠', '7'), c('♥', 'K'), c('♦', 'Q')]; // 7-high 同花 (23457)
const straightSeven = [c('♠', 'T'), c('♥', 'J'), c('♦', 'Q'), c('♣', 'K'), c('♠', 'A'), c('♥', '2'), c('♦', '5')]; // A-high 顺子
const flushEval = evaluateHand(flushSeven);
const straightEval = evaluateHand(straightSeven);
console.log(`7-high 同花 score: ${flushEval.score}`);
console.log(`A-high 顺子 score: ${straightEval.score}`);
console.log(flushEval.score > straightEval.score ? '✓ 同花强于顺子（正确）' : '✗ 顺子强于同花（错误）');
