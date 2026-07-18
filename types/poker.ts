// 扑克牌核心类型定义

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type HandRank =
  | 'high_card'      // 高牌
  | 'pair'           // 对子
  | 'two_pair'       // 两对
  | 'three_of_a_kind' // 三条
  | 'straight'       // 顺子
  | 'flush'          // 同花
  | 'full_house'     // 葫芦
  | 'four_of_a_kind' // 四条
  | 'straight_flush' // 同花顺
  | 'royal_flush';   // 皇家同花顺

export interface EvaluatedHand {
  rank: HandRank;
  score: number;        // 用于比较的大小，分数越大越强
  bestFive: Card[];     // 最佳 5 张牌
  description: string;  // 比如 "葫芦，K 带 7"
}

export type GameStage = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface PlayerState {
  id: string;              // socket id / session id
  nickname: string;
  chips: number;           // 剩余筹码
  holeCards: Card[];       // 手牌
  currentBet: number;      // 本轮已下注
  totalBetThisHand: number; // 本手牌累计下注
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;       // 庄家
  isSmallBlind: boolean;   // 小盲
  isBigBlind: boolean;     // 大盲
  hasActed: boolean;       // 本轮是否已行动
  lastAction?: PlayerAction;
  lastActionAmount?: number;
  connected: boolean;
  lastHeartbeat: number;  // 最后心跳时间（用于失联检测）
}

export interface RoomSettings {
  maxPlayers: number;       // 2-6
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  password: string;         // 房间密码
}

export type RoomStatus = 'waiting' | 'playing' | 'ended';

export interface SidePot {
  amount: number;                  // 池子金额
  eligiblePlayerIds: string[];     // 有资格争夺此池的玩家
}

export interface WinnerInfo {
  playerId: string;
  hand: EvaluatedHand;
  amountWon: number;               // 总赢得金额
  potsWon: { potIndex: number; amount: number }[];  // 从哪些池赢得
}

export interface Room {
  id: string;               // 房间号，比如 "POKER-A1B2"
  hostId: string;           // 房主 playerId
  settings: RoomSettings;
  status: RoomStatus;
  players: PlayerState[];
  communityCards: Card[];   // 公共牌
  deck: Card[];             // 牌堆（debug 用，实际可隐藏）
  pot: number;              // 底池总额（所有 side pots 之和）
  currentBet: number;       // 当前轮注
  minRaise: number;         // 最小加注额
  stage: GameStage;
  dealerIndex: number;      // 庄家位置（玩家数组中的下标）
  activePlayerIndex: number | null; // 当前行动玩家下标
  handNumber: number;       // 当前是第几手牌
  sidePots?: SidePot[];     // 边池明细（仅 showdown 时填充）
  lastWinners?: WinnerInfo[];
  createdAt: number;
  updatedAt: number;
}
