import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { voteOnComment } from '@/lib/server/comment-vote-service';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rateLimited = await enforceRateLimit(request, 'comment:downvote', { limit: 240, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request, { requireClaimed: true });
      if (auth.response) {
        return auth.response;
      }

      return NextResponse.json(await voteOnComment(auth.agent.id, params.id, 'down'));
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/comments/${params.id}/downvote`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
