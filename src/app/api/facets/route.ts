import { NextRequest, NextResponse } from 'next/server';
import { getArchiveFacets, getFacetSuggestions, type FacetKey } from '@/lib/server/facets-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const facet = searchParams.get('facet') as FacetKey | null;
    const q = searchParams.get('q') || '';
    const limit = Number(searchParams.get('limit') || '8');

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
