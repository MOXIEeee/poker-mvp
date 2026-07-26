'use client';

import { motion } from 'framer-motion';
import type { Card as CardType } from '@/types/poker';
import { cn } from '@/lib/utils';

// 4-color deck (Scheme C — 鲜亮现代风)
const SUIT_COLORS: Record<string, string> = {
  '♠': 'text-slate-900',     // #0f172a
  '♥': 'text-rose-600',      // #e11d48
  '♣': 'text-emerald-500',   // #10b981
  '♦': 'text-blue-500',      // #3b82f6
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

// 入场 / 出场 spring 动画
const dealVariants = {
  initial: { opacity: 0, y: 24, scale: 0.85, rotate: -6 },
  animate: { opacity: 1, y: 0, scale: 1, rotate: 0 },
  exit: { opacity: 0, y: -12, scale: 0.85 },
};

const spring = { type: 'spring' as const, stiffness: 320, damping: 24 };

// 高亮态:无限脉冲 boxShadow
const highlightPulse = {
  opacity: 1,
  y: 0,
  scale: 1,
  rotate: 0,
  boxShadow: [
    '0 0 0 0px rgba(250, 204, 21, 0)',
    '0 0 0 5px rgba(250, 204, 21, 0.55)',
    '0 0 0 0px rgba(250, 204, 21, 0)',
  ],
};

const highlightTransition = {
  boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const },
};

export function Card({ card, size = 'md', faceDown = false, highlight = false, className }: CardProps) {
  const sizeClasses = {
    sm: 'w-9 h-12 text-xs',
    md: 'w-12 h-16 sm:w-14 sm:h-20 text-sm sm:text-base',
    lg: 'w-16 h-24 sm:w-20 sm:h-28 text-lg sm:text-xl',
  }[size];

  // 牌背(没有 card 或 faceDown)
  if (faceDown || !card) {
    return (
      <motion.div
        variants={dealVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={spring}
        whileHover={{ y: -4, scale: 1.04 }}
        className={cn(
          'card-back rounded-md border border-slate-300 shadow-md',
          sizeClasses,
          className
        )}
      />
    );
  }

  const suitClass = SUIT_COLORS[card.suit] ?? 'text-slate-900';
  const display = RANK_DISPLAY[card.rank] || card.rank;

  return (
    <motion.div
      variants={dealVariants}
      initial="initial"
      animate={highlight ? highlightPulse : 'animate'}
      transition={highlight ? highlightTransition : spring}
      exit="exit"
      whileHover={{ y: -4, scale: 1.04 }}
      className={cn(
        'bg-gradient-to-b from-white to-slate-50 rounded-md border border-slate-200 shadow-md flex flex-col items-center justify-center font-bold relative overflow-hidden',
        suitClass,
        sizeClasses,
        highlight && 'ring-2 ring-yellow-400/70',
        className
      )}
    >
      {/* 顶部光泽层,模拟塑料牌反光 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent" />

      <span className="absolute top-0.5 left-1 text-[0.7em] leading-none z-10">{display}</span>
      <span className="text-[1.3em] leading-none z-10">{card.suit}</span>
      <span className="absolute bottom-0.5 right-1 text-[0.7em] leading-none rotate-180 z-10">{display}</span>
    </motion.div>
  );
}
