'use client';

/**
 * BGM 播放器 — Web Audio API 双 BufferSource 交叉淡入实现无缝循环
 *
 * 为什么不用 audio.loop = true:
 *   audio.loop 会在缓冲区末尾瞬间跳回开头,产生"咔"的听感。
 *   改用两个 BufferSource 交替播放,后一个在前一个结束前 N 秒淡入,
 *   形成无突兀的连续背景音乐。
 *
 * 状态持久化在 localStorage 'poker_bgm_enabled'
 */

const STORAGE_KEY = 'poker_bgm_enabled';
const SRC = '/bgm/jazz-loop.mp3';
const CROSSFADE = 2.5; // 交叉淡入秒数(必须 ≤ 音频头尾的 fade 区间)

class BGMManager {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private current: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private next: AudioBufferSourceNode | null = null;
  private nextGain: GainNode | null = null;
  private nextStartTime = 0;
  private playing = false;
  private enabled: boolean;
  private volume = 0.35;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.enabled = stored === null ? false : stored === 'true';
    } else {
      this.enabled = false;
    }
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setEnabled(enabled: boolean) {
    const wasPlaying = this.playing;
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    }
    if (enabled && !wasPlaying) {
      this.play().catch(() => {});
    } else if (!enabled && wasPlaying) {
      this.pause();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.currentGain && this.ctx) {
      this.currentGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  private async loadBuffer(): Promise<AudioBuffer> {
    if (this.buffer) return this.buffer;
    const ctx = this.ensureCtx();
    if (!ctx) throw new Error('No AudioContext');
    const res = await fetch(SRC);
    const arr = await res.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(arr);
    return this.buffer;
  }

  private scheduleNext(currentStartTime: number, duration: number) {
    if (!this.ctx || !this.buffer) return;

    // 下一段在 (duration - CROSSFADE) 时启动
    this.nextStartTime = currentStartTime + duration - CROSSFADE;

    const nextSrc = this.ctx.createBufferSource();
    nextSrc.buffer = this.buffer;
    const nextGain = this.ctx.createGain();
    nextGain.gain.setValueAtTime(0, this.nextStartTime);
    nextGain.gain.linearRampToValueAtTime(this.volume, this.nextStartTime + CROSSFADE);

    nextSrc.connect(nextGain).connect(this.ctx.destination);
    nextSrc.start(this.nextStartTime);

    this.next = nextSrc;
    this.nextGain = nextGain;

    // 当前段最后 CROSSFADE 秒淡出
    if (this.currentGain) {
      this.currentGain.gain.setValueAtTime(this.volume, this.nextStartTime);
      this.currentGain.gain.linearRampToValueAtTime(0, this.nextStartTime + CROSSFADE);
    }

    // 当前段结束,清理并轮换
    nextSrc.onended = () => {
      if (this.current && this.current !== nextSrc) {
        try { this.current.stop(); } catch { /* noop */ }
        try { this.current.disconnect(); } catch { /* noop */ }
      }
      this.current = nextSrc;
      this.currentGain = nextGain;
      this.next = null;
      this.nextGain = null;
      // 递归:为下一段调度
      if (this.playing) {
        this.scheduleNext(this.nextStartTime, duration);
      }
    };
  }

  async play() {
    if (this.playing) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.playing = true;
    if (!this.enabled) this.enabled = true;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }

    try {
      const buffer = await this.loadBuffer();
      const now = ctx.currentTime + 0.05; // 短暂延迟,避免 click

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume, now);
      src.connect(gain).connect(ctx.destination);
      src.start(now);

      this.current = src;
      this.currentGain = gain;
      this.scheduleNext(now, buffer.duration);
    } catch {
      this.playing = false;
    }
  }

  pause() {
    this.playing = false;
    [this.current, this.next].forEach(s => {
      if (s) {
        try { s.stop(); } catch { /* noop */ }
        try { s.disconnect(); } catch { /* noop */ }
      }
    });
    [this.currentGain, this.nextGain].forEach(g => {
      if (g) {
        try { g.disconnect(); } catch { /* noop */ }
      }
    });
    this.current = null;
    this.currentGain = null;
    this.next = null;
    this.nextGain = null;
  }
}

let instance: BGMManager | null = null;

export function getBGM(): BGMManager {
  if (!instance) {
    instance = new BGMManager();
  }
  return instance;
}
