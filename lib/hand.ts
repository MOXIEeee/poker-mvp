import type { Card, EvaluatedHand, HandRank, Rank } from '@/types/poker';

// Rank 数值（A 最大，2 最小）
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

// 5 个 4-bit 数拼成一个 score，方便比较
// level 占据最高 5 个 4-bit (固定)，kickers 占据低 5 个 4-bit (不足用 0 填充)
// 这样 level 1 最小 = 16^5 = 1048576 > level 0 最大 = 16^5 - 1 = 1048575，牌型等级不会互相重叠
function packScore(level: number, kickers: number[]): number {
  let score = level;
  for (let i = 0; i < 5; i++) {
    score = score * 16 + ((kickers[i] ?? 0) & 0xf);
  }
  return score;
}

// 判断 5 张牌是不是顺子，返回顺子的最高牌值（A-2-3-4-5 时返回 5，10-J-Q-K-A 时返回 14=A）
function isStraight(cards: Card[]): number | null {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b);
  // A-2-3-4-5 特殊处理：A 当 1 用，high = 5
  if (values[0] === 2 && values[1] === 3 && values[2] === 4 && values[3] === 5 && values[4] === 14) {
    return 5;
  }
  // 普通顺子：返回最高牌值（不是最低！）
  if (values[4] - values[0] === 4 && new Set(values).size === 5) {
    return values[4];
  }
  return null;
}

// 判断 5 张牌的牌型
function evaluateFive(cards: Card[]): EvaluatedHand {
  const suits = cards.map(c => c.suit);
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a); // 降序
  const isFlush = new Set(suits).size === 1;
  const straightHigh = isStraight(cards);

  const counts: Record<number, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  // 按 (count desc, value desc) 排序
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  // 同花顺 / 皇家同花顺
  if (isFlush && straightHigh !== null) {
    if (straightHigh === 14) {
      return {
        rank: 'royal_flush',
        score: packScore(9, [14]),
        bestFive: cards,
        description: '皇家同花顺',
      };
    }
    return {
      rank: 'straight_flush',
      score: packScore(8, [straightHigh]),
      bestFive: cards,
      description: `同花顺，${rankName(straightHigh)} 高`,
    };
  }

  // 四条
  if (groups[0].count === 4) {
    return {
      rank: 'four_of_a_kind',
      score: packScore(7, [groups[0].value, groups[1].value]),
      bestFive: cards,
      description: `四条，${rankName(groups[0].value)}`,
    };
  }

  // 葫芦
  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      rank: 'full_house',
      score: packScore(6, [groups[0].value, groups[1].value]),
      bestFive: cards,
      description: `葫芦，${rankName(groups[0].value)} 带 ${rankName(groups[1].value)}`,
    };
  }

  // 同花
  if (isFlush) {
    return {
      rank: 'flush',
      score: packScore(5, values),
      bestFive: cards,
      description: `同花，${rankName(values[0])} 高`,
    };
  }

  // 顺子
  if (straightHigh !== null) {
    return {
      rank: 'straight',
      score: packScore(4, [straightHigh]),
      bestFive: cards,
      description: `顺子，${rankName(straightHigh)} 高`,
    };
  }

  // 三条
  if (groups[0].count === 3) {
    const kickers = values.filter(v => v !== groups[0].value);
    return {
      rank: 'three_of_a_kind',
      score: packScore(3, [groups[0].value, ...kickers]),
      bestFive: cards,
      description: `三条，${rankName(groups[0].value)}`,
    };
  }

  // 两对
  if (groups[0].count === 2 && groups[1].count === 2) {
    const high = Math.max(groups[0].value, groups[1].value);
    const low = Math.min(groups[0].value, groups[1].value);
    const kicker = values.find(v => v !== high && v !== low)!;
    return {
      rank: 'two_pair',
      score: packScore(2, [high, low, kicker]),
      bestFive: cards,
      description: `两对，${rankName(high)} 和 ${rankName(low)}`,
    };
  }

  // 对子
  if (groups[0].count === 2) {
    const kickers = values.filter(v => v !== groups[0].value);
    return {
      rank: 'pair',
      score: packScore(1, [groups[0].value, ...kickers]),
      bestFive: cards,
      description: `对子，${rankName(groups[0].value)}`,
    };
  }

  // 高牌
  return {
    rank: 'high_card',
    score: packScore(0, values),
    bestFive: cards,
    description: `高牌，${rankName(values[0])}`,
  };
}

function rankName(v: number): string {
  if (v === 14) return 'A';
  if (v === 13) return 'K';
  if (v === 12) return 'Q';
  if (v === 11) return 'J';
  if (v === 10) return 'T';
  return String(v);
}

// 从 7 张牌中选最佳 5 张组合
export function evaluateHand(sevenCards: Card[]): EvaluatedHand {
  if (sevenCards.length < 5) {
    throw new Error('至少需要 5 张牌');
  }
  // 如果只有 5 张，直接评估
  if (sevenCards.length === 5) {
    return evaluateFive(sevenCards);
  }
  // C(n,5) 枚举所有 5 张组合
  let best: EvaluatedHand | null = null;
  const n = sevenCards.length;
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const combo = [sevenCards[i], sevenCards[j], sevenCards[k], sevenCards[l], sevenCards[m]];
            const result = evaluateFive(combo);
            if (!best || result.score > best.score) {
              best = result;
            }
          }
        }
      }
    }
  }
  return best!;
}
