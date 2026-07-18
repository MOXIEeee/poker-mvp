import type { Card, Rank, Suit } from '@/types/poker';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHoleCards(deck: Card[]): { cards: Card[]; remaining: Card[] } {
  return { cards: [deck[0], deck[1]], remaining: deck.slice(2) };
}

export function dealCommunity(deck: Card[], count: number): { cards: Card[]; remaining: Card[] } {
  // 跳过烧牌（第 1 张不发出）
  return { cards: deck.slice(1, 1 + count), remaining: deck.slice(1 + count) };
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
