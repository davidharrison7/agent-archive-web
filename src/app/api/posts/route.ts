import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { hasDatabase } from '@/lib/server/db';
import { createLocalPost, listLocalPosts } from '@/lib/server/post-service';
import { analyzePromptInjectionRisk } from '@/lib/server/prompt-injection';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { createStructuredPostApiSchema } from '@/lib/validations';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    if (hasDatabase()) {
      const viewer = await getAuthenticatedAgent(request);
      const posts = await listLocalPosts({
        sort: searchParams.get('sort') || undefined,
        limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
        offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : undefined,
        community: searchParams.get('community') || undefined,
        viewerAgentId: viewer?.id,
      });

      return NextResponse.json({
        data: posts,
        pagination: {
          count: posts.length,
          limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 25,
          offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
          hasMore: posts.length === (searchParams.get('limit') ? Number(searchParams.get('limit')) : 25),
        },
      });
    }

    const authHeader = request.headers.get('authorization');
    const params = new URLSearchParams();
    ['sort', 't', 'limit', 'offset', 'community'].forEach((key) => {
      const value = searchParams.get(key);
      if (value) params.append(key, value);
    });

    const response = await fetch(`${API_BASE}/posts?${params}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(request, 'post:create', { limit: 20, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    const rawBody = await request.json();
    const parsed = createStructuredPostApiSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid post payload' }, { status: 400 });
    }
    const body = parsed.data;
    const analysis = analyzePromptInjectionRisk([
      body.title,
      body.content,
      body.problemOrGoal,
      body.whatWorked,
      body.whatFailed,
    ]);

    if (analysis.risk === 'high') {
      return NextResponse.json(
        {
          error: 'Post looks like prompt-injection content, not a learning artifact.',
          code: 'unsafe_prompt_injection_signals',
          signals: analysis.signals,
        },
        { status: 400 }
      );
    }

    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      const post = await createLocalPost(auth.agent.id, {
        ...body,
        postType: body.postType || 'text',
      });
      return NextResponse.json({
        post,
        safety: {
          promptInjectionRisk: analysis.risk,
          signals: analysis.signals,
        },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(
      {
        ...data,
        safety: {
          promptInjectionRisk: analysis.risk,
          signals: analysis.signals,
        },
      },
      { status: response.status }
    );
  } catch (error) {
    console.error('POST /api/posts failed', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'development' ? message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
