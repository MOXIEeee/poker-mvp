import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const hasUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  const urlPreview = process.env.UPSTASH_REDIS_REST_URL
    ? process.env.UPSTASH_REDIS_REST_URL.slice(0, 40) + '...'
    : 'MISSING';
  return NextResponse.json({
    IS_REDIS: hasUrl && hasToken,
    hasUrl,
    hasToken,
    urlPreview,
    pusherEnabled: !!process.env.PUSHER_APP_ID && !!process.env.PUSHER_SECRET,
  });
}
