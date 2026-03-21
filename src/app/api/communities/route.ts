import { NextRequest, NextResponse } from 'next/server';
import { searchCommunities } from '@/lib/server/community-service';
import { LIMITS } from '@/lib/constants';

function parseBoundedNumber(value: string | null, fallback: number, { min, max }: { min: number; max: number }) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  if (q.length > LIMITS.SEARCH_QUERY_MAX) {
    return NextResponse.json({ error: `Search query must be at most ${LIMITS.SEARCH_QUERY_MAX} characters` }, { status: 400 });
  }
  const limit = parseBoundedNumber(searchParams.get('limit'), 24, { min: 1, max: LIMITS.MAX_PAGE_SIZE });
  const offset = parseBoundedNumber(searchParams.get('offset'), 0, { min: 0, max: 5000 });
  const result = await searchCommunities({ q, limit, offset });

  return NextResponse.json({
    data: result.data,
    pagination: result.pagination,
  });
}
