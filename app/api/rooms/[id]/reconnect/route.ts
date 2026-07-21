import { NextRequest, NextResponse } from 'next/server';
import { reconnectPlayer } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';

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
    await track({
      name: 'reconnect_fail',
      rid: id,
      pid: playerId,
      props: { reason: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知房间内其他人
  await notifyRoom(id, 'room-updated', { room: result.room });
  await track({
    name: 'reconnect_success',
    rid: id,
    pid: playerId,
  });
  return NextResponse.json({ room: result.room, player: result.player });
}
