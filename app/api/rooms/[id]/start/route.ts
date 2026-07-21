import { NextRequest, NextResponse } from 'next/server';
import { startHandByHost } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';

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

  // 埋点：开始一手
  await track({
    name: 'start_hand',
    rid: id,
    pid: playerId,
    props: {
      hand_number: result.room.handNumber,
      player_count: result.room.players.length,
      active_count: result.room.players.filter((p) => p.chips > 0).length,
    },
  });

  return NextResponse.json({ room: result.room });
}
