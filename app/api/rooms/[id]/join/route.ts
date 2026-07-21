import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { nickname, password } = body as { nickname: string; password?: string };

  if (!nickname?.trim()) {
    return NextResponse.json({ error: '昵称不能为空' }, { status: 400 });
  }

  const result = await joinRoom(id, password || '', nickname.trim());
  if ('error' in result) {
    // 埋点：加入失败
    await track({
      name: 'join_room_fail',
      rid: id,
      props: { reason: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知房间内所有人
  await notifyRoom(id, 'room-updated', { room: result.room });

  const isHost = result.room.hostId === result.playerId;
  // 埋点：加入成功
  await track({
    name: 'join_room_success',
    rid: id,
    pid: result.playerId,
    props: {
      is_host: isHost,
      player_count: result.room.players.length,
    },
  });

  return NextResponse.json({ playerId: result.playerId, room: result.room });
}
