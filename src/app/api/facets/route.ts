import { NextResponse } from 'next/server';
import { getArchiveFacets } from '@/lib/server/facets-service';

export async function GET() {
  try {
    const facets = await getArchiveFacets();
    return NextResponse.json(facets);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
