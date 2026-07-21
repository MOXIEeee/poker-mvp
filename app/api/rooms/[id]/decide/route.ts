import { NextRequest, NextResponse } from 'next/server';
import { toggleReveal } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';

// 亮牌/弃牌 toggle（纯展示性，不影响结算）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { playerId, reveal } = body as {
    playerId: string;
    reveal: boolean;
  };

  if (!playerId) {
    return NextResponse.json({ error: '缺少 playerId' }, { status: 400 });
  }
  if (typeof reveal !== 'boolean') {
    return NextResponse.json({ error: 'reveal 必须是 boolean' }, { status: 400 });
  }

  const result = await toggleReveal(id, playerId, reveal);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await notifyRoom(id, 'room-updated', { room: result.room });

  // 埋点：show / muck 选择
  await track({
    name: reveal ? 'show_hand' : 'muck_hand',
    rid: id,
    pid: playerId,
    props: { hand_number: result.room.handNumber },
  });

  return NextResponse.json({ room: result.room });
}
