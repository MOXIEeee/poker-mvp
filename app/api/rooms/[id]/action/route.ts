import { NextRequest, NextResponse } from 'next/server';
import { getRoom, processAction } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';
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
    await track({
      name: 'player_action_fail',
      rid: id,
      pid: playerId,
      props: { action, reason: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // 通知所有订阅者
  await notifyRoom(id, 'game-updated', { room: result.room });

  // 埋点：玩家行动
  const room = result.room;
  const me = room.players.find((p) => p.id === playerId);
  await track({
    name: 'player_action',
    rid: id,
    pid: playerId,
    props: {
      action,
      amount: amount ?? 0,
      hand_number: room.handNumber,
      street: room.stage,
      chips_after: me?.chips,
      pot_after: room.pot,
    },
  });

  // 埋点：摊牌（hand complete）
  if (room.stage === 'showdown' && action === 'call') {
    // 简化：用 stage 切换 + showdown 事件来标识
    // 这里 action 是 'call' 但实际可能是最后的 all-in call
    // 真正的 hand_complete 由客户端收 Pusher 后再 track
  }

  return NextResponse.json({ room: result.room });
}
