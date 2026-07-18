import { NextRequest, NextResponse } from 'next/server';
import { joinRoom } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';

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
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知房间内所有人
  await notifyRoom(id, 'room-updated', { room: result.room });
  return NextResponse.json({ playerId: result.playerId, room: result.room });
}
