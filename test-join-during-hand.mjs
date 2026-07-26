// 测试：牌局进行中不能加入；牌局间隙（status='ended'）可以加入
// 验证：加入的玩家能在下一手牌中正常参与

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

// 找一个 active 玩家 (fold 别人)
async function foldOthers(roomId, ids, keepId) {
  let guard = 0;
  while (guard++ < 50) {
    const room = await getActiveRoom(roomId);
    if (room.status !== 'playing') return room;
    const ap = room.players[room.activePlayerIndex];
    if (!ap) break;
    if (ap.id === keepId) {
      // 我们的玩家被高亮 — 他必须行动(call/fold 即可)
      const r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: keepId, action: 'fold' });
      if (r.status !== 200) return room;
    } else {
      const r = await api(`/api/rooms/${roomId}/action`, 'POST', { playerId: ap.id, action: 'fold' });
      if (r.status !== 200) return room;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return await getActiveRoom(roomId);
}

async function run() {
  console.log('=== 测试: 牌局中加人 + 牌局间隙加人 ===\n');

  // 1. 房主 Alice 开 3 人房
  console.log('Step 1: 创建 3 人房（容量 9）');
  const c = await api('/api/rooms', 'POST', {
    nickname: 'Alice', maxPlayers: 9, smallBlind: 10, bigBlind: 20, startingChips: 1000,
  });
  if (c.status !== 200) { ng('创建房间失败', JSON.stringify(c.data)); return; }
  ok(`房间 ${c.data.roomId} 创建 (maxPlayers=9)`);
  const roomId = c.data.roomId;
  const aliceId = c.data.playerId;

  // Bob + Carol 加入
  await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Bob' });
  await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Carol' });
  ok('Bob + Carol 加入');

  // 2. 开打 1 手
  console.log('\nStep 2: 玩一手牌');
  await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  ok('Alice 开始第一手');

  // 3. 牌局进行中，Dan 尝试加入 — 应该失败
  console.log('\nStep 3: 牌局进行中, Dan 尝试加入（应失败）');
  const danMidGame = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Dan' });
  if (danMidGame.status === 200) {
    ng('牌局进行中加入应该被拒绝，但成功了');
  } else if (danMidGame.data.error?.includes('进行中')) {
    ok(`牌局进行中正确拒绝: "${danMidGame.data.error}"`);
  } else {
    ng('拒绝原因不对', danMidGame.data.error);
  }

  // 4. 跑完这一手
  console.log('\nStep 4: 让这一手结束（其他人 fold）');
  const ids = [aliceId, ...[]].concat(
    (await getActiveRoom(roomId)).players.filter(p => p.id !== aliceId).map(p => p.id)
  );
  await foldOthers(roomId, ids, aliceId);
  const roomAfterHand = await getActiveRoom(roomId);
  if (roomAfterHand.status === 'ended') {
    ok(`第一手结束，status='ended'`);
  } else {
    ng(`第一手结束后 status 应该是 'ended'，实际是 '${roomAfterHand.status}'`);
  }
  if (roomAfterHand.handNumber === 1) {
    ok('handNumber = 1');
  } else {
    ng(`handNumber 应为 1，实际 ${roomAfterHand.handNumber}`);
  }

  // 5. 牌局间隙，Dan / Eve / Frank / Grace 加入
  console.log('\nStep 5: 牌局间隙，4 个新玩家加入');
  for (const name of ['Dan', 'Eve', 'Frank', 'Grace']) {
    const r = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: name });
    if (r.status === 200) ok(`${name} 加入成功`);
    else ng(`${name} 加入失败: ${JSON.stringify(r.data)}`);
  }

  // 6. 验证 7 人在房间里 (Alice + Bob + Carol 初始 + Dan/Eve/Frank/Grace 新增 = 7)
  const roomAfterJoin = await getActiveRoom(roomId);
  if (roomAfterJoin.players.length === 7) {
    ok(`房间现在有 7 个玩家: ${roomAfterJoin.players.map(p => p.nickname).join(', ')}`);
  } else {
    ng(`应有 7 人，实际 ${roomAfterJoin.players.length} 人`);
  }

  // 7. 6 人满，再加一个应该失败
  console.log('\nStep 6: 容量上限测试（房间已满 6/9 但新加入仍在 ended 状态）');
  // 等等, room 现在是 6/9, 没满,加 Henry 应该成功
  const r7 = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Henry' });
  if (r7.status === 200) ok('Henry 加入成功 (6→7)');
  else ng('Henry 加入失败', JSON.stringify(r7.data));

  // 加到 9 人
  await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Ivy' });
  const r8 = await api(`/api/rooms/${roomId}/join`, 'POST', { nickname: 'Jack' });
  if (r8.status !== 200 && r8.data.error?.includes('房间已满')) {
    ok('第 10 个玩家 Jack 被正确拒绝 (9/9 已满)');
  } else {
    ng('Jack 应被拒但加入成功', JSON.stringify(r8.data));
  }

  // 8. 房主开始下一手，9 人局
  console.log('\nStep 7: 房主开始下一手（9 人局）');
  const r9 = await api(`/api/rooms/${roomId}/start`, 'POST', { playerId: aliceId });
  if (r9.status !== 200) {
    ng('开始 9 人局失败', JSON.stringify(r9.data));
    return;
  }
  const roomNewHand = r9.data.room;
  if (roomNewHand.handNumber === 2) {
    ok('handNumber = 2 (新一手)');
  } else {
    ng(`handNumber 应为 2，实际 ${roomNewHand.handNumber}`);
  }
  if (roomNewHand.players.length === 9) {
    ok(`9 个玩家全部参与新一手: ${roomNewHand.players.map(p => p.nickname).join(', ')}`);
  } else {
    ng(`应 9 人参与，实际 ${roomNewHand.players.length} 人`);
  }
  if (roomNewHand.status === 'playing') {
    ok('status = playing');
  } else {
    ng(`status 应为 'playing'，实际 '${roomNewHand.status}'`);
  }

  // 9. 验证 chip 守恒
  const totalChips = roomNewHand.players.reduce((s, p) => s + p.chips, 0) + (roomNewHand.pot || 0);
  const expected = 9 * 1000;
  if (totalChips === expected) {
    ok(`筹码守恒: 9 人 × $1000 = $${totalChips}`);
  } else {
    ng(`筹码泄漏: 期望 $${expected}, 实际 $${totalChips}`);
  }

  // 10. 玩完这一手，验证 9 人边池
  console.log('\nStep 8: 让 9 人局跑完，验证不崩');
  const allIds = roomNewHand.players.map(p => p.id);
  // 找非 alice 的一个保留，让他也 fold
  const otherId = allIds.find(id => id !== aliceId);
  await foldOthers(roomId, allIds, otherId);
  const finalRoom = await getActiveRoom(roomId);
  if (finalRoom.status === 'ended' || finalRoom.handNumber > roomNewHand.handNumber) {
    ok(`9 人局成功跑完一手，handNumber = ${finalRoom.handNumber}`);
  } else {
    ng(`9 人局没跑完，status=${finalRoom.status}, handNumber=${finalRoom.handNumber}`);
  }
  // 再验证守恒
  const finalTotal = finalRoom.players.reduce((s, p) => s + p.chips, 0) + (finalRoom.pot || 0);
  if (finalTotal === expected) {
    ok(`9 人局结束筹码仍守恒: $${finalTotal}`);
  } else {
    ng(`9 人局筹码泄漏: $${finalTotal} (期望 $${expected})`);
  }

  console.log(`\n=== 总结: ${pass} 通过, ${fail} 失败 ===`);
  if (fail > 0) process.exitCode = 1;
}

run().catch(e => { console.error('TEST ERROR:', e); process.exit(1); });
