import { NextRequest, NextResponse } from 'next/server';
import { getHomepagePosts } from '@/lib/server/home-feed-service';

type SortMode = 'hot' | 'new' | 'top';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = (searchParams.get('sort') as SortMode) || 'hot';
    const posts = await getHomepagePosts(sort);
    return NextResponse.json({ posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
