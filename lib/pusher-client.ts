'use client';

import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function getPusherClient(): Pusher | null {
  if (typeof window === 'undefined') return null;
  if (pusherInstance) return pusherInstance;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'ap3';

  if (!key) {
    console.warn('[Pusher] Missing NEXT_PUBLIC_PUSHER_KEY, real-time disabled');
    return null;
  }

  pusherInstance = new Pusher(key, {
    cluster,
    enabledTransports: ['ws', 'wss'],
  });
  return pusherInstance;
}

export function getRoomChannel(roomId: string) {
  const pusher = getPusherClient();
  if (!pusher) return null;
  return pusher.subscribe(`room-${roomId}`);
}
