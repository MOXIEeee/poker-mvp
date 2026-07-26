'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { Card as CardType } from '@/types/poker';
import { cn } from '@/lib/utils';
import { getSound } from '@/lib/sound';

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
  silent?: boolean;         // 关闭该牌的音效(用于服务端渲染预览或静音场景)
  className?: string;
}

// 入场 / 出场 spring 动画(放慢一档,更有"重量感")
const dealVariants = {
  initial: { opacity: 0, y: 28, scale: 0.82, rotate: -8 },
  animate: { opacity: 1, y: 0, scale: 1, rotate: 0 },
  exit: { opacity: 0, y: -14, scale: 0.85 },
};

const spring = { type: 'spring' as const, stiffness: 200, damping: 20 };

// 高亮态:无限脉冲 boxShadow(放慢一档,更明显)
const highlightPulse = {
  opacity: 1,
  y: 0,
  scale: 1,
  rotate: 0,
  boxShadow: [
    '0 0 0 0px rgba(250, 204, 21, 0)',
    '0 0 0 6px rgba(250, 204, 21, 0.55)',
    '0 0 0 0px rgba(250, 204, 21, 0)',
  ],
};

const highlightTransition = {
  boxShadow: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const },
};

export function Card({ card, size = 'md', faceDown = false, highlight = false, silent = false, className }: CardProps) {
  const sizeClasses = {
    sm: 'w-9 h-12 text-xs',
    md: 'w-12 h-16 sm:w-14 sm:h-20 text-sm sm:text-base',
    lg: 'w-16 h-24 sm:w-20 sm:h-28 text-lg sm:text-xl',
  }[size];

  // 音效:牌面首次出现 / 牌面变化 → 发牌音
  useEffect(() => {
    if (silent) return;
    if (!card) return;
    // 随机延迟 0~120ms,多张同时发牌时不撞音
    getSound().play('deal', { delay: Math.random() * 0.12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.rank, card?.suit, silent]);

  // 音效:faceDown true → false → 翻牌音
  const prevFaceDown = useRef(faceDown);
  useEffect(() => {
    if (silent) return;
    if (prevFaceDown.current === true && faceDown === false) {
      getSound().play('flip');
    }
    prevFaceDown.current = faceDown;
  }, [faceDown, silent]);

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
