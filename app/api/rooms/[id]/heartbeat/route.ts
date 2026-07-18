import { NextRequest, NextResponse } from 'next/server';
import { updateHeartbeat } from '@/lib/game';

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

  const result = await updateHeartbeat(id, playerId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
