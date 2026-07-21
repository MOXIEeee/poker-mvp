import { NextRequest, NextResponse } from 'next/server';
import { createRoom } from '@/lib/game';
import { notifyRoom } from '@/lib/pusher-server';
import { track } from '@/lib/analytics-server';
import type { RoomSettings } from '@/types/poker';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { nickname, maxPlayers, smallBlind, bigBlind, startingChips, password } = body as {
    nickname: string;
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
    password?: string;
  };

  if (!nickname?.trim()) {
    return NextResponse.json({ error: '昵称不能为空' }, { status: 400 });
  }
  if (maxPlayers < 2 || maxPlayers > 6) {
    return NextResponse.json({ error: '玩家数必须在 2-6 之间' }, { status: 400 });
  }
  if (smallBlind < 1 || bigBlind < smallBlind * 2) {
    return NextResponse.json({ error: '盲注设置不合理' }, { status: 400 });
  }
  if (startingChips < bigBlind * 10) {
    return NextResponse.json({ error: '初始筹码太少了' }, { status: 400 });
  }

  const settings: RoomSettings = {
    maxPlayers,
    smallBlind,
    bigBlind,
    startingChips,
    password: password || '',
  };

  const room = await createRoom(settings, nickname.trim());
  // 通知频道（虽然没人订阅，先留着）
  await notifyRoom(room.id, 'room-updated', { room });

  // 埋点：创建房间成功
  await track({
    name: 'create_room_success',
    rid: room.id,
    pid: room.hostId,
    props: {
      max_players: maxPlayers,
      small_blind: smallBlind,
      big_blind: bigBlind,
      starting_chips: startingChips,
      has_password: !!password,
    },
  });

  return NextResponse.json({
    roomId: room.id,
    playerId: room.hostId,
    room,
  });
}
