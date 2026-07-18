import { NextRequest, NextResponse } from 'next/server';
import { reconnectPlayer } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId } = body as { playerId: string };

  if (!playerId) {
    return NextResponse.json({ error: '缺少 playerId' }, { status: 400 });
  }

  const result = await reconnectPlayer(id, playerId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知房间内其他人
  await notifyRoom(id, 'room-updated', { room: result.room });
  return NextResponse.json({ room: result.room, player: result.player });
}
