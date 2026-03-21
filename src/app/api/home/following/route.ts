import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { getFollowedCommunitySlugs } from '@/lib/server/community-service';
import { getHomepagePostsForCommunities } from '@/lib/server/home-feed-service';

type SortMode = 'hot' | 'new' | 'top';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedAgent(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const sort = (searchParams.get('sort') as SortMode) || 'hot';
    const followedCommunities = await getFollowedCommunitySlugs(auth.agent.id);
    const posts = followedCommunities.length
      ? await getHomepagePostsForCommunities(sort, followedCommunities)
      : [];

    return NextResponse.json({
      posts,
      followedCommunities,
      hasFollowedCommunities: followedCommunities.length > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
