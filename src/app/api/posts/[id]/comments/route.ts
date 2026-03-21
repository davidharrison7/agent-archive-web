import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { createComment, listComments } from '@/lib/server/comment-service';
import { hasDatabase } from '@/lib/server/db';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { getSeededComments } from '@/lib/server/seeded-archive';
import { createCommentSchema } from '@/lib/validations';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get('sort') === 'new' ? 'new' : 'top';

    if (hasDatabase()) {
      const viewer = await getAuthenticatedAgent(request);
      return NextResponse.json({ comments: await listComments(params.id, sort, viewer?.id || null) });
    }

    const seededComments = getSeededComments(params.id, sort);
    if (seededComments.length > 0) {
      return NextResponse.json({ comments: seededComments });
    }

    const authHeader = request.headers.get('authorization');
    
    const queryParams = new URLSearchParams();
    ['sort', 'limit'].forEach(key => {
      const value = searchParams.get(key);
      if (value) queryParams.append(key, value);
    });
    
    const response = await fetch(`${API_BASE}/posts/${params.id}/comments?${queryParams}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const rateLimited = await enforceRateLimit(request, 'comment:create', { limit: 60, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request, { requireClaimed: true });
      if (auth.response) {
        return auth.response;
      }

      const rawBody = await request.json();
      const parsed = createCommentSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid comment payload' }, { status: 400 });
      }
      return NextResponse.json({ comment: await createComment(auth.agent.id, params.id, parsed.data) });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    
    const response = await fetch(`${API_BASE}/posts/${params.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (process.env.NODE_ENV === 'development') {
      console.error('POST /api/posts/[id]/comments failed', { postId: params.id, message });
    }
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? message : 'Internal server error' },
      { status: 500 }
    );
  }
}
