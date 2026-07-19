import { NextRequest, NextResponse } from 'next/server';
import { decideShowdown } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId, choice } = body as {
    playerId: string;
    choice: 'show' | 'muck';
  };

  if (!playerId) {
    return NextResponse.json({ error: '缺少 playerId' }, { status: 400 });
  }
  if (choice !== 'show' && choice !== 'muck') {
    return NextResponse.json({ error: 'choice 必须是 show 或 muck' }, { status: 400 });
  }

  const result = await decideShowdown(id, playerId, choice);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await notifyRoom(id, 'room-updated', { room: result.room });
  return NextResponse.json({ room: result.room });
}
