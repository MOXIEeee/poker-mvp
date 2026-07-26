// 测试：牌局进行中以 spectator 身份加入；牌局间隙（status='ended'）正常加入
// 验证：spectator 在当前手不能行动 / 下一手自动转正

const BASE = 'http://localhost:3000';

async function api(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

let pass = 0, fail = 0;
function ok(msg) { pass++; console.log('  ✓', msg); }
function ng(msg, detail) { fail++; console.log('  ✗', msg, detail || ''); }

async function getActiveRoom(roomId) {
  const r = await api(`/api/rooms/${roomId}`);
  return r.data.room;
}

// 让一手牌结束（依次 fold active player）
async function foldOthers(roomId, keepIds) {
  let guard = 0;
  while (guard++ < 100) {
    const room = await getActiveRoom(roomId);
    if (room.status !== 'playing') return room;
    const ap = room.players[room.activePlayerIndex];
    if (!ap) break;
    if (keepIds.includes(ap.id)) {
      // 保留的也要行动以推进（只能 fold）
      await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: ap.id, action: 'fold' });
    } else {
      await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: ap.id, action: 'fold' });
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return await getActiveRoom(roomId);
}

async function run() {
  console.log('=== 测试: 牌局中以 spectator 加入 + 牌局间隙正常加入 ===\n');

  // 1. 房主 Alice 开 9 人房
  console.log('Step 1: 创建 9 人房');
  const c = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: 9, smallBlind: 10, bigBlind: 20, startingChips: 1000,
  });
  if (c.status !== 200) { ng('创建房间失败', JSON.stringify(c.data)); return; }
  ok(`房间 ${c.data.roomId} 创建 (maxPlayers=9)`);
  const roomId = c.data.roomId;
  const aliceId = c.data.playerId;

  // Bob + Carol 加入
  const b1 = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Bob' });
  const b2 = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Carol' });
  ok(`Bob + Carol 加入（共 3 人）`);

  // 2. 开打第 1 手
  console.log('\nStep 2: 开始第一手牌');
  await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  ok('Alice 开始第一手');

  // 3. 牌局进行中，Dan 加入 → 应该是 spectator
  console.log('\nStep 3: 牌局进行中, Dan 加入 (应成为 spectator)');
  const danJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Dan' });
  if (danJoin.status !== 200) {
    ng('牌局中 Dan 加入失败', JSON.stringify(danJoin.data));
    return;
  }
  ok('Dan 在牌局中成功加入');
  const danId = danJoin.data.playerId;
  const danPlayer = danJoin.data.room.players.find(p => p.id === danId);
  if (danPlayer?.isSpectator === true) {
    ok(`Dan.isSpectator = true (本手牌不能行动)`);
  } else {
    ng(`Dan.isSpectator 应为 true，实际 ${danPlayer?.isSpectator}`);
  }

  // 4. Dan 的 holeCards 应为空（没发牌）
  if (Array.isArray(danPlayer.holeCards) && danPlayer.holeCards.length === 0) {
    ok('Dan.holeCards 为空（不发牌）');
  } else {
    ng(`Dan.holeCards 应为空，实际 ${JSON.stringify(danPlayer.holeCards)}`);
  }

  // 5. Dan 尝试在牌局中行动 → 应被拒
  console.log('\nStep 4: Dan 尝试在牌局中行动 (应被拒)');
  const danAction = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: danId, action: 'fold' });
  if (danAction.status !== 200 && danAction.data.error?.includes('观战')) {
    ok(`Dan 行动被拒: "${danAction.data.error}"`);
  } else {
    ng('Dan 行动未被拒', JSON.stringify(danAction.data));
  }

  // 6. 让这一手结束（所有人 fold）
  console.log('\nStep 5: 让第一手结束（全部 fold）');
  await foldOthers(roomId, []);  // 没人保留
  const roomAfterHand = await getActiveRoom(roomId);
  if (roomAfterHand.status === 'ended') {
    ok(`第一手结束, status='ended', handNumber=${roomAfterHand.handNumber}`);
  } else {
    ng(`第一手结束后 status 应为 'ended'，实际 '${roomAfterHand.status}'`);
    return;
  }

  // 7. 牌局间隙加 Eve / Frank / Grace
  console.log('\nStep 6: 牌局间隙, 3 个新玩家加入 (正常玩家)');
  for (const name of ['Eve', 'Frank', 'Grace']) {
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: name });
    if (r.status === 200) {
      const p = r.data.room.players.find(pp => pp.nickname === name);
      if (p?.isSpectator === false) {
        ok(`${name} 加入成功, isSpectator=false (正常玩家)`);
      } else {
        ng(`${name} 应该是正常玩家，但 isSpectator=${p?.isSpectator}`);
      }
    } else {
      ng(`${name} 加入失败: ${JSON.stringify(r.data)}`);
    }
  }

  // 8. 房主开始第 2 手
  console.log('\nStep 7: 开始第二手 (7 人)');
  const r9 = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  if (r9.status !== 200) {
    ng('开始第 2 手失败', JSON.stringify(r9.data));
    return;
  }
  const roomH2 = r9.data.room;
  ok(`第 2 手开始, handNumber=${roomH2.handNumber}, status=${roomH2.status}`);

  // 9. Dan 现在应转为正常玩家
  const danH2 = roomH2.players.find(p => p.nickname === 'Dan');
  if (danH2?.isSpectator === false) {
    ok('Dan.isSpectator = false (第 2 手已转正)');
  } else {
    ng(`Dan 在第 2 手应为正常玩家，实际 isSpectator=${danH2?.isSpectator}`);
  }
  if (Array.isArray(danH2.holeCards) && danH2.holeCards.length === 2) {
    ok('Dan.holeCards = 2 张 (本手已发牌)');
  } else {
    ng(`Dan 应有 2 张牌，实际 ${JSON.stringify(danH2.holeCards)}`);
  }

  // 10. 牌局中再加 1 个 spectator
  console.log('\nStep 8: 牌局进行中, Henry 加入 (应成为 spectator)');
  const henryJoin = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Henry' });
  if (henryJoin.status === 200) {
    const henry = henryJoin.data.room.players.find(p => p.nickname === 'Henry');
    if (henry?.isSpectator === true) {
      ok('Henry 加入成功且为 spectator');
    } else {
      ng(`Henry 应是 spectator，实际 isSpectator=${henry?.isSpectator}`);
    }
  } else {
    ng('Henry 加入失败', JSON.stringify(henryJoin.data));
  }

  // 11. 验证 chip 守恒 (Henry 加完后, 7 active + 1 spectator + pot)
  const roomWithHenry = henryJoin.data.room;
  const totalChips = roomWithHenry.players.reduce((s, p) => s + p.chips, 0) + (roomWithHenry.pot || 0);
  const expectedTotal = 8 * 1000;  // 7 active + 1 spectator, pot 也从 8000 扣出来的
  if (totalChips === expectedTotal) {
    ok(`筹码守恒: 8 个玩家 + pot = $${totalChips} (含 pot $${roomWithHenry.pot})`);
  } else {
    ng(`筹码异常: 期望 $${expectedTotal}, 实际 $${totalChips}`);
  }

  // 12. 让第 2 手跑完
  console.log('\nStep 9: 让第 2 手跑完, 验证 spectator 不参与结算');
  await foldOthers(roomId, []);
  const roomH2End = await getActiveRoom(roomId);
  if (roomH2End.status === 'ended') {
    ok('第 2 手结束');
  } else {
    ng(`第 2 手应结束，status=${roomH2End.status}`);
  }

  // 验证 Henry（spectator）chips 没变（没参与本手）
  const henryEnd = roomH2End.players.find(p => p.nickname === 'Henry');
  if (henryEnd.chips === 1000) {
    ok(`Henry (spectator) 筹码未变: $${henryEnd.chips}`);
  } else {
    ng(`Henry 筹码应仍是 $1000 (没参与本手)，实际 $${henryEnd.chips}`);
  }

  // 13. 房主开始第 3 手
  console.log('\nStep 10: 开始第 3 手, Henry 转正');
  const r13 = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  if (r13.status !== 200) {
    ng('开始第 3 手失败', JSON.stringify(r13.data));
    return;
  }
  const henryH3 = r13.data.room.players.find(p => p.nickname === 'Henry');
  if (henryH3?.isSpectator === false) {
    ok('Henry 在第 3 手转正为正常玩家');
  } else {
    ng(`Henry 应在第 3 手转正，实际 isSpectator=${henryH3?.isSpectator}`);
  }

  // 14. 容量上限测试：再加 2 个到 9 人，第 10 个被拒
  console.log('\nStep 11: 容量上限 (9/9)');
  await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Ivy' });
  await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Jack' });
  const r14 = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Kate' });
  if (r14.status !== 200 && r14.data.error?.includes('房间已满')) {
    ok('第 10 个玩家 Kate 被正确拒绝 (9/9 已满)');
  } else {
    ng('Kate 应被拒但加入成功', JSON.stringify(r14.data));
  }

  console.log(`\n=== 总结: ${pass} 通过, ${fail} 失败 ===`);
  if (fail > 0) process.exitCode = 1;
}

run().catch(e => { console.error('TEST ERROR:', e); process.exit(1); });
