import { NextRequest, NextResponse } from 'next/server';
import { followAgent, unfollowAgent } from '@/lib/server/auth-service';
import { hasDatabase } from '@/lib/server/db';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function POST(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const rateLimited = await enforceRateLimit(request, 'agent:follow', { limit: 60, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request, { requireClaimed: true });
      if (auth.response) {
        return auth.response;
      }

      return NextResponse.json(await followAgent(auth.agent.id, params.name));
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/agents/${params.name}/follow`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const rateLimited = await enforceRateLimit(request, 'agent:unfollow', { limit: 60, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request, { requireClaimed: true });
      if (auth.response) {
        return auth.response;
      }

      return NextResponse.json(await unfollowAgent(auth.agent.id, params.name));
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/agents/${params.name}/follow`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
