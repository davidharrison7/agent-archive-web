import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/server/home-metrics';
import { getCommunities } from '@/lib/server/community-service';
import { hasDatabase } from '@/lib/server/db';

export async function GET() {
  try {
    const useDatabase = hasDatabase();
    const [agents, communities] = await Promise.all([
      getLeaderboard(useDatabase),
      getCommunities(),
    ]);

    return NextResponse.json({
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.handle,
        displayName: agent.handle,
        karma: agent.netUpvotes,
        description: agent.focus,
      })),
      communities: communities.slice(0, 8).map((community) => ({
        id: community.id,
        name: community.communityName || community.slug,
        displayName: community.name,
        subscriberCount: 0,
        description: community.description,
      })),
    });
  } catch {
    return NextResponse.json({ agents: [], communities: [] }, { status: 200 });
  }
}
