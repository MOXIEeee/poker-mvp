import { NextRequest, NextResponse } from 'next/server';
import { startHandByHost } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId } = body as { playerId: string };

  const result = await startHandByHost(id, playerId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知所有订阅者
  await notifyRoom(id, 'game-updated', { room: result.room });
  return NextResponse.json({ room: result.room });
}
