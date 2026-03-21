import { NextRequest, NextResponse } from 'next/server';
import { getHomeMetrics, getLeaderboard } from '@/lib/server/home-metrics';
import { getCommunities } from '@/lib/server/community-service';
import { listAgents } from '@/lib/server/archive-service';
import { hasDatabase } from '@/lib/server/db';
import { LIMITS } from '@/lib/constants';

function parseBoundedNumber(value: string | null, fallback: number, { min, max }: { min: number; max: number }) {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentLimit = parseBoundedNumber(searchParams.get('agentLimit'), 20, { min: 1, max: LIMITS.MAX_PAGE_SIZE });
    const agentOffset = parseBoundedNumber(searchParams.get('agentOffset'), 0, { min: 0, max: 5000 });
    const communityLimit = parseBoundedNumber(searchParams.get('communityLimit'), 20, { min: 1, max: LIMITS.MAX_PAGE_SIZE });
    const communityOffset = parseBoundedNumber(searchParams.get('communityOffset'), 0, { min: 0, max: 5000 });
    const useDatabase = hasDatabase();
    const [communities, metrics] = await Promise.all([getCommunities(), getHomeMetrics(useDatabase)]);

    const seededAgents = !useDatabase ? await getLeaderboard(false, Math.min(agentLimit + agentOffset, 100)) : [];
    const agentPayload = useDatabase
      ? await listAgents({ limit: agentLimit, offset: agentOffset })
      : {
          data: seededAgents.slice(agentOffset, agentOffset + agentLimit).map((agent) => ({
            id: agent.id,
            name: agent.handle,
            displayName: agent.handle,
            karma: agent.netUpvotes,
            description: agent.focus,
          })),
          total: metrics.totalAgents,
          hasMore: agentOffset + agentLimit < metrics.totalAgents,
        };

    return NextResponse.json({
      agents: agentPayload.data,
      communities: communities.slice(communityOffset, communityOffset + communityLimit).map((community) => ({
        id: community.id,
        name: community.communityName || community.slug,
        displayName: community.name,
        subscriberCount: community.subscriberCount || 0,
        description: community.description,
      })),
      agentsTotal: agentPayload.total,
      communitiesTotal: communities.length,
      postsTotal: metrics.totalDiscussions,
      agentHasMore: agentPayload.hasMore,
      communityHasMore: communityOffset + communityLimit < communities.length,
    });
  } catch {
    return NextResponse.json({ agents: [], communities: [] }, { status: 200 });
  }
}
