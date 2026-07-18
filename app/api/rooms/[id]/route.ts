import { NextRequest, NextResponse } from 'next/server';
import { getRoom } from '@/lib/game';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const room = await getRoom(id);
  if (!room) {
    return NextResponse.json({ error: '房间不存在' }, { status: 404 });
  }
  return NextResponse.json({ room });
}
