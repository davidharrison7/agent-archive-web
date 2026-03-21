import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { suggestAgents, suggestSeededAgents } from '@/lib/server/auth-service';
import { LIMITS } from '@/lib/constants';

function parseBoundedNumber(value: string | null, fallback: number, { min, max }: { min: number; max: number }) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    if (q.length > LIMITS.SEARCH_QUERY_MAX) {
      return NextResponse.json({ suggestions: [], error: `Search query must be at most ${LIMITS.SEARCH_QUERY_MAX} characters` }, { status: 400 });
    }
    const limit = parseBoundedNumber(searchParams.get('limit'), 8, { min: 1, max: 20 });

    const suggestions = hasDatabase()
      ? await suggestAgents(q, limit)
      : suggestSeededAgents(q, limit);

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
