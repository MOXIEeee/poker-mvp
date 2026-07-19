// 长局测试：在同一房间连续跑 20 手，验证筹码守恒
// 混合各种场景：fold, call, raise, all-in
const BASE = 'https://poker-mvp-liart.vercel.app';

async function api(path, method = 'GET', body, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(BASE + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json().catch(() => ({})) };
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ALL_NAMES = ['Alice', 'Bob', 'Carol', 'Dan', 'Eve', 'Frank'];

async function createRoom(numPlayers, chips) {
  const create = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: numPlayers,
    smallBlind: 10, bigBlind: 20, startingChips: chips,
  });
  const roomId = create.data.roomId;
  const ids = [create.data.playerId];
  for (let i = 1; i < numPlayers; i++) {
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: ALL_NAMES[i] });
    if (r.status !== 200) throw new Error(`P${i} join: ${JSON.stringify(r.data)}`);
    ids.push(r.data.playerId);
  }
  return { roomId, ids };
}

// 玩一手：每个人根据 strategy 决定行动
async function playOneHand(roomId, ids, seed) {
  // seed-based random for reproducibility
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let r = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: ids[0] });
  if (r.status !== 200) throw new Error(`start failed: ${JSON.stringify(r.data)}`);
  let room = r.data.room;

  let safety = 0;
  while (room.stage !== 'showdown' && room.stage !== 'ended' && safety++ < 100) {
    if (room.activePlayerIndex === null) break;
    const idx = room.activePlayerIndex;
    const player = room.players[idx];
    if (!player || player.folded || player.allIn) {
      // 不应该到这
      break;
    }
    const callAmount = room.currentBet - player.currentBet;
    const r1 = rng();
    let action;
    if (player.chips === 0) {
      // 没筹码了，不该到这
      break;
    } else if (r1 < 0.2) {
      action = { action: 'fold' };
    } else if (r1 < 0.35 && callAmount === 0) {
      action = { action: 'check' };
    } else if (r1 < 0.5) {
      action = { action: 'check' };
    } else if (r1 < 0.7 && callAmount > 0) {
      action = { action: 'call' };
    } else if (r1 < 0.85) {
      // raise by 20-60
      const raiseBy = Math.min(20 + Math.floor(rng() * 40), player.chips);
      if (raiseBy < room.minRaise) {
        // 不够 raise 就 call 或 check
        action = callAmount > 0 ? { action: 'call' } : { action: 'check' };
      } else {
        action = { action: 'raise', amount: raiseBy };
      }
    } else {
      action = { action: 'all_in' };
    }

    const ar = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: player.id, ...action });
    if (ar.status !== 200) {
      // fallback: fold
      const fb = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: player.id, action: 'fold' });
      if (fb.status !== 200) break;
      room = fb.data.room;
    } else {
      room = ar.data.room;
    }
  }
  return room;
}

async function longGameTest(numPlayers, numHands, chips, seed) {
  console.log(`\n=== ${numPlayers} 人局跑 ${numHands} 手 (每人 $${chips}, seed=${seed}) ===`);
  const { roomId, ids } = await createRoom(numPlayers, chips);
  console.log(`房间 ${roomId}`);

  const initialTotal = numPlayers * chips;
  let handNum = 0;
  let leakedChips = 0;
  const errors = [];

  while (handNum < numHands) {
    handNum++;
    const room = await playOneHand(roomId, ids, seed + handNum * 1000);
    const totalChips = room.players.reduce((s, p) => s + p.chips, 0);
    // 包含 pot (如果手没跑完)
    const total = totalChips + (room.pot || 0);
    const diff = total - initialTotal;
    const status = diff === 0 ? '✓' : (diff > 0 ? `+${diff}` : `${diff}`);
    const winnerInfo = room.lastWinners ?
      ` | 赢: ${room.lastWinners.map(w => `${w.amountWon}`).join('+')}` : '';
    console.log(`  手 ${String(handNum).padStart(2)}: 筹码 $${total} (差 ${status})${winnerInfo}`);
    if (diff !== 0) {
      errors.push({ hand: handNum, total, diff, chips: room.players.map(p => p.chips) });
      leakedChips += Math.abs(diff);
    }
  }

  if (errors.length === 0) {
    console.log(`\n  🎉 ${numHands} 手全部守恒！`);
  } else {
    console.log(`\n  ❌ ${errors.length} 手不守恒，累计泄漏 ${leakedChips}`);
    process.exitCode = 1;
    // 详细输出第一手错误
    const e = errors[0];
    console.log(`  错误示例 (手 ${e.hand}): 总筹码 ${e.total}, 差 ${e.diff}`);
    console.log(`  players chips: ${JSON.stringify(e.chips)}`);
  }
  return errors.length === 0;
}

const results = [];
for (const [n, hands, seed] of [[2, 20, 42], [3, 20, 100], [4, 20, 200], [5, 20, 300], [6, 20, 400]]) {
  const ok = await longGameTest(n, hands, 1000, seed);
  results.push({ n, hands, ok });
  await sleep(1000);
}

console.log('\n=== 汇总 ===');
results.forEach(r => console.log(`  ${r.n} 人局 ${r.hands} 手: ${r.ok ? '✓' : '❌'}`));
console.log(process.exitCode ? '\n❌ 有泄漏' : '\n🎉 全部守恒');
