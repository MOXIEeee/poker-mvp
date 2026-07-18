import Pusher from 'pusher';

// 服务端 Pusher 实例（用于触发事件）
// 注意：这个实例只在服务端 API route 里使用，不要在客户端代码里 import
let pusherInstance: Pusher | null = null;

function getPusher(): Pusher | null {
  if (pusherInstance) return pusherInstance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || 'ap3';

  if (!appId || !key || !secret) {
    console.warn('[Pusher] Missing env vars, real-time disabled (will use polling fallback)');
    return null;
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });
  return pusherInstance;
}

export function isPusherEnabled(): boolean {
  return getPusher() !== null;
}

export async function notifyRoom(
  roomId: string,
  event: 'room-updated' | 'game-updated' | 'chat-message',
  data: unknown
): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger(`room-${roomId}`, event, data);
  } catch (err) {
    console.error('[Pusher] Trigger failed:', err);
  }
}

export async function notifyChat(
  roomId: string,
  message: { playerId: string; nickname: string; text: string; time: number }
): Promise<void> {
  await notifyRoom(roomId, 'chat-message', message);
}
