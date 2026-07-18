import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game';
import { notifyChat } from '@/lib/pusher-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId, text } = body as { playerId: string; text: string };

  if (!text?.trim()) {
    return NextResponse.json({ error: '消息不能为空' }, { status: 400 });
  }

  const room = await getRoom(id);
  if (!room) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 });
  }

  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return NextResponse.json({ error: '玩家不在房间内' }, { status: 403 });
  }

  const message = {
    playerId,
    nickname: player.nickname,
    text: text.trim().slice(0, 200),
    time: Date.now(),
  };

  await notifyChat(id, message);
  return NextResponse.json({ ok: true, message });
}
