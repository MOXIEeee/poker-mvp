import type { Card, EvaluatedHand, PlayerState, Room, RoomSettings, GameStage, PlayerAction, SidePot } from '@/types/poker';
import { createDeck, shuffle, dealHoleCards, dealCommunity } from './deck';
import { evaluateHand } from './hand';
import { nanoid } from 'nanoid';
import { Redis } from '@upstash/redis';

// ==================== 存储层：Upstash Redis (生产) + 内存 Map (本地 dev) ====================

// Upstash Redis 启用条件：有 UPSTASH_REDIS_REST_URL + TOKEN
export const IS_REDIS = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = IS_REDIS
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// 暴露给其他模块（如埋点）共用同一个 Redis 客户端
export function getRedis(): Redis | null {
  return redis;
}

// 本地 dev 用内存 Map（生产环境绝对不能 fallback）
const memoryRooms = new Map<string, Room>();
const memoryPlayerIndex = new Map<string, string>();

const ROOM_KEY = (id: string) => `poker:room:${id}`;
const PLAYER_KEY = (id: string) => `poker:player:${id}`; // playerId → roomId

async function kvGetRoom(roomId: string): Promise<Room | null> {
  if (IS_REDIS && redis) {
    const data = await redis.get<Room>(ROOM_KEY(roomId));
    return data ?? null;
  }
  return memoryRooms.get(roomId) ?? null;
}

async function kvSetRoom(room: Room): Promise<void> {
  if (IS_REDIS && redis) {
    // 24 小时过期
    await redis.set(ROOM_KEY(room.id), room, { ex: 86400 });
  } else {
    memoryRooms.set(room.id, room);
  }
}

async function kvDeleteRoom(roomId: string): Promise<void> {
  if (IS_REDIS && redis) {
    await redis.del(ROOM_KEY(roomId));
  } else {
    memoryRooms.delete(roomId);
  }
}

async function kvGetRoomByPlayer(playerId: string): Promise<string | null> {
  if (IS_REDIS && redis) {
    const data = await redis.get<string>(PLAYER_KEY(playerId));
    return data ?? null;
  }
  return memoryPlayerIndex.get(playerId) ?? null;
}

async function kvSetPlayerIndex(playerId: string, roomId: string): Promise<void> {
  if (IS_REDIS && redis) {
    await redis.set(PLAYER_KEY(playerId), roomId, { ex: 86400 });
  } else {
    memoryPlayerIndex.set(playerId, roomId);
  }
}

async function kvDeletePlayerIndex(playerId: string): Promise<void> {
  if (IS_REDIS && redis) {
    await redis.del(PLAYER_KEY(playerId));
  } else {
    memoryPlayerIndex.delete(playerId);
  }
}

// ==================== 房间管理 ====================

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `POKER-${code}`;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  return kvGetRoom(roomId);
}

export async function getRoomByPlayer(playerId: string): Promise<Room | null> {
  const roomId = await kvGetRoomByPlayer(playerId);
  if (!roomId) return null;
  return kvGetRoom(roomId);
}

export async function createRoom(settings: RoomSettings, hostNickname: string): Promise<Room> {
  const roomId = generateRoomCode();
  const hostId = `player_${nanoid(10)}`;
  const host: PlayerState = {
    id: hostId,
    nickname: hostNickname,
    chips: settings.startingChips,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    folded: false,
    allIn: false,
    isDealer: true,
    isSmallBlind: false,
    isBigBlind: false,
    hasActed: false,
    connected: true,
    lastHeartbeat: Date.now(),
    revealed: false,
    mucked: false,
  };

  const room: Room = {
    id: roomId,
    hostId,
    settings,
    status: 'waiting',
    players: [host],
    communityCards: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: settings.bigBlind,
    stage: 'preflop',
    dealerIndex: 0,
    activePlayerIndex: null,
    handNumber: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kvSetRoom(room);
  await kvSetPlayerIndex(hostId, roomId);
  return room;
}

export async function joinRoom(
  roomId: string,
  password: string,
  nickname: string
): Promise<{ room: Room; playerId: string } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.status !== 'waiting') return { error: '牌局已开始，无法加入' };
  if (room.players.length >= room.settings.maxPlayers) return { error: '房间已满' };
  if (room.settings.password && room.settings.password !== password) return { error: '房间密码错误' };
  if (room.players.some(p => p.nickname === nickname)) return { error: '昵称已被使用' };

  const playerId = `player_${nanoid(10)}`;
  const newPlayer: PlayerState = {
    id: playerId,
    nickname,
    chips: room.settings.startingChips,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    folded: false,
    allIn: false,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    hasActed: false,
    connected: true,
    lastHeartbeat: Date.now(),
    revealed: false,
    mucked: false,
  };

  room.players.push(newPlayer);
  room.updatedAt = Date.now();
  await kvSetRoom(room);
  await kvSetPlayerIndex(playerId, roomId);
  return { room, playerId };
}

export async function leaveRoom(playerId: string): Promise<void> {
  const roomId = await kvGetRoomByPlayer(playerId);
  if (!roomId) return;
  const room = await kvGetRoom(roomId);
  if (!room) return;

  room.players = room.players.filter(p => p.id !== playerId);
  await kvDeletePlayerIndex(playerId);

  if (room.hostId === playerId) {
    if (room.players.length > 0) {
      room.hostId = room.players[0].id;
    } else {
      await kvDeleteRoom(roomId);
      return;
    }
  }

  room.updatedAt = Date.now();
  await kvSetRoom(room);
}

// ==================== 牌局状态机 ====================

// 找下一个能行动的玩家（从 fromIndex 之后开始顺时针）
// 用于：翻前 UTG 起、翻后 SB 起、轮转找下一位
function nextActiveIndex(room: Room, fromIndex: number): number | null {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    const p = room.players[idx];
    if (!p.folded && !p.allIn && p.chips > 0) return idx;
  }
  return null;
}

function postBlinds(room: Room): void {
  const n = room.players.length;
  if (n < 2) return;
  const dealerIdx = room.dealerIndex;
  const sbIdx = n === 2 ? dealerIdx : (dealerIdx + 1) % n;
  const bbIdx = (dealerIdx + (n === 2 ? 1 : 2)) % n;

  room.players.forEach((p, i) => {
    p.isDealer = i === dealerIdx;
    p.isSmallBlind = i === sbIdx;
    p.isBigBlind = i === bbIdx;
  });

  const sb = room.players[sbIdx];
  const bb = room.players[bbIdx];
  const sbAmount = Math.min(room.settings.smallBlind, sb.chips);
  const bbAmount = Math.min(room.settings.bigBlind, bb.chips);

  sb.chips -= sbAmount;
  sb.currentBet = sbAmount;
  sb.totalBetThisHand = sbAmount;
  if (sb.chips === 0) sb.allIn = true;

  bb.chips -= bbAmount;
  bb.currentBet = bbAmount;
  bb.totalBetThisHand = bbAmount;
  if (bb.chips === 0) bb.allIn = true;

  room.pot = sbAmount + bbAmount;
  room.currentBet = bbAmount;
  room.minRaise = room.settings.bigBlind;
}

function startNewHand(room: Room): void {
  if (room.players.length < 2) return;

  room.handNumber++;
  // 庄家轮转：第一手房主是庄家，从第二手开始顺时针轮转
  if (room.handNumber > 1) {
    room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  }
  room.stage = 'preflop';
  room.communityCards = [];
  room.pot = 0;
  room.currentBet = 0;

  room.players.forEach(p => {
    p.holeCards = [];
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.folded = false;
    p.allIn = false;
    p.hasActed = false;
    p.lastAction = undefined;
    p.lastActionAmount = undefined;
    p.revealed = false;
    p.mucked = false;
  });

  room.deck = shuffle(createDeck());
  let remaining = room.deck;
  for (const player of room.players) {
    const { cards, remaining: r } = dealHoleCards(remaining);
    player.holeCards = cards;
    remaining = r;
  }
  room.deck = remaining;

  postBlinds(room);

  // 翻前行动顺序：BB 之后第一个 active = UTG（heads-up 时 dealer/SB 先）
  // - 2人: dealer=SB=0, BB=1 → 庄家(0) 先行动
  // - 3人: D=0, SB=1, BB=2 → 庄家(0) 先行动（3人局无独立 UTG）
  // - 4-6人: D=0, SB=1, BB=2, UTG=3+ → UTG 先行动
  const n = room.players.length;
  const bbIdx = (room.dealerIndex + (n === 2 ? 1 : 2)) % n;
  room.activePlayerIndex = nextActiveIndex(room, bbIdx);

  room.status = 'playing';
  room.updatedAt = Date.now();
}

export async function processAction(
  roomId: string,
  playerId: string,
  action: PlayerAction,
  amount?: number
): Promise<{ ok: true; room: Room } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.status !== 'playing') return { error: '牌局未开始或已结束' };
  if (room.activePlayerIndex === null) return { error: '当前没有可行动的玩家' };

  const player = room.players[room.activePlayerIndex];
  if (!player || player.id !== playerId) return { error: '不是你的回合' };
  if (player.folded || player.allIn) return { error: '你已经不能行动了' };

  const callAmount = room.currentBet - player.currentBet;
  const toCall = Math.max(0, callAmount);

  switch (action) {
    case 'fold': {
      player.folded = true;
      player.lastAction = 'fold';
      player.hasActed = true;
      break;
    }
    case 'check': {
      if (toCall > 0) return { error: '当前注额不为 0，无法过牌' };
      player.lastAction = 'check';
      player.hasActed = true;
      break;
    }
    case 'call': {
      if (toCall === 0) return { error: '没有需要跟的注额' };
      const pay = Math.min(toCall, player.chips);
      player.chips -= pay;
      player.currentBet += pay;
      player.totalBetThisHand += pay;
      room.pot += pay;
      player.lastAction = 'call';
      player.lastActionAmount = pay;
      player.hasActed = true;
      if (player.chips === 0) player.allIn = true;
      break;
    }
    case 'raise': {
      if (amount === undefined || amount <= 0) {
        return { error: '加注额必须大于 0' };
      }
      const actualAmount = Math.min(amount, player.chips);
      const actualTotalBet = player.currentBet + actualAmount;
      const raiseDiff = actualTotalBet - room.currentBet;
      // 加注必须把总注额提到 room.currentBet 之上，且 raiseDiff >= minRaise
      if (raiseDiff <= 0) {
        return { error: '加注额太小（应该用跟注）' };
      }
      if (raiseDiff < room.minRaise) {
        return { error: `加注增量必须至少为 ${room.minRaise}（当前差 ${raiseDiff}）` };
      }
      player.chips -= actualAmount;
      player.currentBet = actualTotalBet;
      player.totalBetThisHand += actualAmount;
      room.pot += actualAmount;
      room.minRaise = raiseDiff;
      room.currentBet = actualTotalBet;
      room.players.forEach(p => {
        if (!p.folded && !p.allIn && p.id !== player.id) p.hasActed = false;
      });
      player.lastAction = 'raise';
      player.lastActionAmount = actualAmount;
      player.hasActed = true;
      if (player.chips === 0) player.allIn = true;
      break;
    }
    case 'all_in': {
      const allInAmount = player.chips;
      player.chips = 0;
      player.currentBet += allInAmount;
      player.totalBetThisHand += allInAmount;
      room.pot += allInAmount;
      if (player.currentBet > room.currentBet) {
        const raiseDiff = player.currentBet - room.currentBet;
        if (raiseDiff >= room.minRaise) room.minRaise = raiseDiff;
        room.currentBet = player.currentBet;
        room.players.forEach(p => {
          if (!p.folded && !p.allIn && p.id !== player.id) p.hasActed = false;
        });
      }
      player.allIn = true;
      player.lastAction = 'all_in';
      player.lastActionAmount = allInAmount;
      player.hasActed = true;
      break;
    }
  }

  advanceGame(room);
  room.updatedAt = Date.now();
  await kvSetRoom(room);
  return { ok: true, room };
}

function advanceGame(room: Room): void {
  const activePlayers = room.players.filter(p => !p.folded);
  if (activePlayers.length === 1) {
    endHand(room, [activePlayers[0]]);
    return;
  }

  // playersNeedAction: 没弃牌、没 all-in、还有筹码（chips=0 视为隐式 all-in）
  const playersNeedAction = room.players.filter(p => !p.folded && !p.allIn && p.chips > 0);
  const allActed = playersNeedAction.length === 0 ||
    playersNeedAction.every(p => p.hasActed && p.currentBet === room.currentBet);

  if (allActed) {
    if (playersNeedAction.length === 0) {
      skipToShowdown(room);
      return;
    }
    if (room.stage === 'preflop') {
      dealStage(room, 'flop', 3);
    } else if (room.stage === 'flop') {
      dealStage(room, 'turn', 1);
    } else if (room.stage === 'turn') {
      dealStage(room, 'river', 1);
    } else if (room.stage === 'river') {
      showdown(room);
      return;
    }
  } else {
    if (room.activePlayerIndex !== null) {
      room.activePlayerIndex = nextActiveIndex(room, room.activePlayerIndex);
    }
  }
}

function dealStage(room: Room, stage: GameStage, count: number): void {
  const { cards, remaining } = dealCommunity(room.deck, count);
  room.communityCards.push(...cards);
  room.deck = remaining;
  room.stage = stage;
  room.currentBet = 0;
  room.minRaise = room.settings.bigBlind;
  room.players.forEach(p => {
    p.currentBet = 0;
    p.hasActed = false;
  });
  room.activePlayerIndex = nextActiveIndex(room, room.dealerIndex);
}

function skipToShowdown(room: Room): void {
  while (room.stage !== 'river' && room.stage !== 'showdown') {
    if (room.stage === 'preflop') {
      dealStage(room, 'flop', 3);
    } else if (room.stage === 'flop') {
      dealStage(room, 'turn', 1);
    } else if (room.stage === 'turn') {
      dealStage(room, 'river', 1);
    } else {
      break;
    }
  }
  showdown(room);
}

export function calculateSidePots(
  evaluated: { player: PlayerState; hand: EvaluatedHand }[],
  allPlayers: PlayerState[]
): SidePot[] {
  // levels: 包含所有玩家（含 folded 玩家，他们投的钱是死钱，要算进 pot）
  const levels = [...new Set(allPlayers.map(p => p.totalBetThisHand))]
    .filter(l => l > 0)
    .sort((a, b) => a - b);

  const pots: SidePot[] = [];
  let prevLevel = 0;
  let deadMoney = 0; // 死钱累积：没有 active 玩家跟注的层级

  for (const level of levels) {
    const contribution = level - prevLevel;
    if (contribution <= 0) continue;
    // contributors: 所有投到这一层的玩家（含 folded），决定 pot 金额
    const contributors = allPlayers.filter(p => p.totalBetThisHand >= level);
    // eligible: 只算 active（没弃牌）且投到这一层的玩家，决定 pot 给谁分
    const eligible = evaluated.filter(e => e.player.totalBetThisHand >= level);
    if (eligible.length === 0) {
      // 死钱：这一层没人能分. 累积, 加到下一个有 eligible 的 pot
      deadMoney += contribution * contributors.length;
    } else {
      pots.push({
        amount: contribution * contributors.length + deadMoney,
        eligiblePlayerIds: eligible.map(e => e.player.id),
      });
      deadMoney = 0;
    }
    prevLevel = level;
  }

  // 剩余死钱（如最高层全是死钱）归到 main pot
  if (deadMoney > 0) {
    if (pots.length === 0) {
      // 全是死钱：分给所有 active 玩家
      pots.push({
        amount: deadMoney,
        eligiblePlayerIds: evaluated.map(e => e.player.id),
      });
    } else {
      // 加到最后一个 pot
      pots[pots.length - 1].amount += deadMoney;
    }
  }
  return pots;
}

function showdown(room: Room): void {
  const activePlayers = room.players.filter(p => !p.folded);

  if (activePlayers.length === 0) {
    room.pot = 0;
    room.status = 'ended';
    room.stage = 'ended';
    room.activePlayerIndex = null;
    return;
  }

  // 立即结算：发牌、算赢家、分池
  const evaluated = activePlayers.map(p => ({
    player: p,
    hand: evaluateHand([...p.holeCards, ...room.communityCards]),
  }));

  const sidePots = calculateSidePots(evaluated, room.players);
  room.sidePots = sidePots;

  const playerWinnings = new Map<string, { amount: number; pots: { potIndex: number; amount: number }[]; hand: EvaluatedHand }>();

  sidePots.forEach((pot, potIndex) => {
    const eligibleEvaluated = evaluated.filter(e => pot.eligiblePlayerIds.includes(e.player.id));
    if (eligibleEvaluated.length === 0) return;
    const maxScore = Math.max(...eligibleEvaluated.map(e => e.hand.score));
    const potWinners = eligibleEvaluated.filter(e => e.hand.score === maxScore);
    const shareAmount = Math.floor(pot.amount / potWinners.length);
    const remainder = pot.amount - shareAmount * potWinners.length;

    potWinners.forEach((w, i) => {
      const amount = shareAmount + (i === 0 ? remainder : 0);
      w.player.chips += amount;

      const existing = playerWinnings.get(w.player.id);
      if (existing) {
        existing.amount += amount;
        existing.pots.push({ potIndex, amount });
      } else {
        playerWinnings.set(w.player.id, {
          amount,
          pots: [{ potIndex, amount }],
          hand: w.hand,
        });
      }
    });
  });

  room.lastWinners = Array.from(playerWinnings.entries()).map(([playerId, info]) => ({
    playerId,
    hand: info.hand,
    amountWon: info.amount,
    potsWon: info.pots,
  }));
  room.pot = 0;
  room.status = 'ended';
  room.stage = 'showdown';
  room.activePlayerIndex = null;
  // revealed/mucked 状态由玩家后续主动 toggle，不在这里初始化
  // （让之前的 toggle 状态保留在 result panel，便于玩家切换）
}

// 亮牌/弃牌 toggle（纯展示性，不阻塞结算）
export async function toggleReveal(
  roomId: string,
  playerId: string,
  reveal: boolean
): Promise<{ ok: true; room: Room } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.status !== 'ended') return { error: '牌局还未结束' };

  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: '玩家不在房间内' };
  if (player.folded) return { error: '你已经弃牌了，不能亮牌' };

  player.revealed = reveal;
  player.mucked = !reveal;

  room.updatedAt = Date.now();
  await kvSetRoom(room);
  return { ok: true, room };
}

function endHand(room: Room, winners: { id: string; chips: number }[]): void {
  const winner = winners[0];
  const player = room.players.find(p => p.id === winner.id);
  if (player) {
    player.chips += room.pot;
    room.lastWinners = [{
      playerId: player.id,
      hand: { rank: 'high_card', score: 0, bestFive: [], description: '其他玩家弃牌' },
      amountWon: room.pot,
      potsWon: [{ potIndex: 0, amount: room.pot }],
    }];
    room.sidePots = [{
      amount: room.pot,
      eligiblePlayerIds: [player.id],
    }];
  }
  room.pot = 0;
  room.status = 'ended';
  room.activePlayerIndex = null;
  room.stage = 'ended';
}

export async function startHandByHost(roomId: string, hostId: string): Promise<{ ok: true; room: Room } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在' };
  if (room.hostId !== hostId) return { error: '只有房主可以开始牌局' };
  if (room.players.length < 2) return { error: '至少需要 2 名玩家' };

  if (room.status === 'ended') {
    resetRoomForNextHand(room);
  }

  startNewHand(room);
  await kvSetRoom(room);
  return { ok: true, room };
}

function resetRoomForNextHand(room: Room): void {
  room.players.forEach(p => {
    p.holeCards = [];
    p.currentBet = 0;
    p.totalBetThisHand = 0;
    p.folded = false;
    p.allIn = false;
    p.hasActed = false;
    p.lastAction = undefined;
    p.lastActionAmount = undefined;
  });
  room.communityCards = [];
  room.pot = 0;
  room.currentBet = 0;
  room.minRaise = room.settings.bigBlind;
  room.lastWinners = undefined;
  room.sidePots = undefined;
  room.activePlayerIndex = null;
  room.stage = 'preflop';
  room.status = 'waiting';
}

// ==================== 重连 / 心跳 ====================

export async function reconnectPlayer(
  roomId: string,
  playerId: string
): Promise<{ room: Room; player: PlayerState } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在或已关闭' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: '玩家不在房间内' };
  player.connected = true;
  player.lastHeartbeat = Date.now();
  room.updatedAt = Date.now();
  await kvSetRoom(room);
  return { room, player };
}

export async function updateHeartbeat(
  roomId: string,
  playerId: string
): Promise<{ ok: true } | { error: string }> {
  const room = await kvGetRoom(roomId);
  if (!room) return { error: '房间不存在' };
  const player = room.players.find(p => p.id === playerId);
  if (!player) return { error: '玩家不在房间内' };
  player.lastHeartbeat = Date.now();
  player.connected = true;
  await kvSetRoom(room);
  return { ok: true };
}

const DISCONNECT_TIMEOUT_MS = 60_000;
const SCAN_INTERVAL_MS = 5_000;

declare global {
  // eslint-disable-next-line no-var
  var __poker_disconnect_scanner__: NodeJS.Timeout | undefined;
}

if (!globalThis.__poker_disconnect_scanner__ && !IS_REDIS) {
  // 注意：Vercel serverless 环境不会持续运行这个定时器
  // 生产环境主要依赖 heartbeat 主动检测（失联玩家 stop 发心跳）
  // KV 存储也可以加个 lastHeartbeat 索引 + 定期清理，但 MVP 先这样
  globalThis.__poker_disconnect_scanner__ = setInterval(() => {
    void (async () => {
      // 仅本地 dev 模式跑扫描
      for (const room of memoryRooms.values()) {
        if (room.status !== 'playing' || room.activePlayerIndex === null) continue;
        const active = room.players[room.activePlayerIndex];
        if (!active) continue;
        if (active.folded || active.allIn) continue;
        const now = Date.now();
        if (now - (active.lastHeartbeat || 0) > DISCONNECT_TIMEOUT_MS) {
          active.connected = false;
          processActionSync(room, active.id, 'fold');
          const { notifyRoom } = await import('./pusher-server');
          await notifyRoom(room.id, 'game-updated', { room });
        }
      }
    })();
  }, SCAN_INTERVAL_MS);
  if (globalThis.__poker_disconnect_scanner__.unref) {
    globalThis.__poker_disconnect_scanner__.unref();
  }
}

// 内部同步版 processAction（仅供 dev 模式定时器用）
function processActionSync(room: Room, playerId: string, action: PlayerAction, amount?: number): void {
  if (room.status !== 'playing' || room.activePlayerIndex === null) return;
  const player = room.players[room.activePlayerIndex];
  if (!player || player.id !== playerId) return;
  if (action === 'fold') {
    player.folded = true;
    player.lastAction = 'fold';
    player.hasActed = true;
  }
  advanceGame(room);
  room.updatedAt = Date.now();
}
