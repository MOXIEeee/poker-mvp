'use client';

import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-slate-500',
        'focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20',
        'transition',
        className
      )}
      {...props}
    />
  );
});
