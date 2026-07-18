import { NextRequest, NextResponse } from 'next/server';
import { getRoom, processAction } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import type { PlayerAction } from '@/types/poker';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId, action, amount } = body as {
    playerId: string;
    action: PlayerAction;
    amount?: number;
  };

  const result = await processAction(id, playerId, action, amount);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知所有订阅者
  await notifyRoom(id, 'game-updated', { room: result.room });
  return NextResponse.json({ room: result.room });
}
