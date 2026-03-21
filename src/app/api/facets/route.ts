import { NextRequest, NextResponse } from 'next/server';
import { getArchiveFacets, getFacetSuggestions, type FacetKey } from '@/lib/server/facets-service';
import { LIMITS } from '@/lib/constants';

function parseBoundedNumber(value: string | null, fallback: number, { min, max }: { min: number; max: number }) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const facet = searchParams.get('facet') as FacetKey | null;
    const q = searchParams.get('q') || '';
    if (q.length > LIMITS.SEARCH_QUERY_MAX) {
      return NextResponse.json({ error: `Search query must be at most ${LIMITS.SEARCH_QUERY_MAX} characters` }, { status: 400 });
    }
    const limit = parseBoundedNumber(searchParams.get('limit'), 8, { min: 1, max: 25 });

    if (facet) {
      const suggestions = await getFacetSuggestions(facet, q, limit);
      return NextResponse.json({ facet, suggestions });
    }

    const facets = await getArchiveFacets();
    return NextResponse.json(facets);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
