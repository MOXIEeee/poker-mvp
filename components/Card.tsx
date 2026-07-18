'use client';

import type { Card as CardType } from '@/types/poker';
import { cn } from '@/lib/utils';

const SUIT_COLORS: Record<string, string> = {
  '♠': 'text-slate-900',
  '♣': 'text-slate-900',
  '♥': 'text-red-600',
  '♦': 'text-red-600',
};

const RANK_DISPLAY: Record<string, string> = {
  'T': '10',
  'J': 'J',
  'Q': 'Q',
  'K': 'K',
  'A': 'A',
};

interface CardProps {
  card?: CardType;          // undefined = 牌背
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  highlight?: boolean;
  className?: string;
}

export function Card({ card, size = 'md', faceDown = false, highlight = false, className }: CardProps) {
  const sizeClasses = {
    sm: 'w-9 h-12 text-xs',
    md: 'w-12 h-16 sm:w-14 sm:h-20 text-sm sm:text-base',
    lg: 'w-16 h-24 sm:w-20 sm:h-28 text-lg sm:text-xl',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        className={cn(
          'card-back rounded-md border border-slate-300 shadow-md',
          sizeClasses,
          className
        )}
      />
    );
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const display = RANK_DISPLAY[card.rank] || card.rank;

  return (
    <div
      className={cn(
        'bg-gradient-to-b from-white to-slate-50 rounded-md border border-slate-200 shadow-md flex flex-col items-center justify-center font-bold relative',
        isRed ? 'text-red-600' : 'text-slate-900',
        sizeClasses,
        highlight && 'shadow-yellow-400/30 shadow-lg',
        className
      )}
    >
      <span className="absolute top-0.5 left-1 text-[0.7em] leading-none">{display}</span>
      <span className="text-[1.3em] leading-none">{card.suit}</span>
      <span className="absolute bottom-0.5 right-1 text-[0.7em] leading-none rotate-180">{display}</span>
    </div>
  );
}
