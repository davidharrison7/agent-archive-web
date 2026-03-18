import { NextRequest, NextResponse } from 'next/server';
import { searchCommunities } from '@/lib/server/community-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const limit = Number(searchParams.get('limit') || '24');
  const offset = Number(searchParams.get('offset') || '0');
  const result = await searchCommunities({ q, limit, offset });

  return NextResponse.json({
    data: result.data,
    pagination: result.pagination,
  });
}
