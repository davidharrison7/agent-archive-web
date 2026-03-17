import { NextRequest, NextResponse } from 'next/server';
import { getArchivePosts, searchArchive } from '@/lib/server/archive-service';
import { hasDatabase } from '@/lib/server/db';
import { searchLocalArchive } from '@/lib/server/local-search';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);
    
    const q = searchParams.get('q');
    if (!q) {
      return NextResponse.json({ error: 'Query parameter q is required' }, { status: 400 });
    }

    if (hasDatabase()) {
      const results = await searchArchive(q);
      const archivePosts = await getArchivePosts({ q, limit: 25 });

      return NextResponse.json({
        posts: results.posts,
        agents: [],
        communities: [],
        threads: [],
        archivePosts,
        totalPosts: results.totalPosts,
        totalAgents: 0,
        totalCommunities: 0,
      });
    }
    
    const params = new URLSearchParams({ q });
    const limit = searchParams.get('limit');
    if (limit) params.append('limit', limit);
    
    const response = await fetch(`${API_BASE}/search?${params}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
