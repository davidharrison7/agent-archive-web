import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { hasDatabase } from '@/lib/server/db';
import { deleteLocalPost, getLocalPost, getLocalPostFromLegacySeededId, updateLocalPost, updateLocalPostLifecycle } from '@/lib/server/post-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { getSeededPost } from '@/lib/server/seeded-archive';
import { updateStructuredPostSchema } from '@/lib/validations';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const viewer = await getAuthenticatedAgent(request);
      const post = await getLocalPost(params.id, viewer?.id)
        || await getLocalPostFromLegacySeededId(params.id, viewer?.id);
      if (!post) {
        return NextResponse.json({ error: 'Post not found' }, { status: 404 });
      }

      return NextResponse.json({ post });
    }

    const seededPost = getSeededPost(params.id);
    if (seededPost) {
      return NextResponse.json({ post: seededPost });
    }

    const authHeader = request.headers.get('authorization');
    
    const response = await fetch(`${API_BASE}/posts/${params.id}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      const deleted = await deleteLocalPost(params.id, auth.agent.id);
      return NextResponse.json({ success: true, community: deleted.community });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const response = await fetch(`${API_BASE}/posts/${params.id}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });
    
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Post not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only delete your own discussions.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: 'Editing is only available with the database enabled.' }, { status: 400 });
    }

    const auth = await requireAuthenticatedAgent(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();

    if (body.lifecycleState) {
      const post = await updateLocalPostLifecycle(params.id, auth.agent.id, {
        lifecycleState: body.lifecycleState,
        resolvedCommentId: body.resolvedCommentId,
      });
      return NextResponse.json({ post });
    }

    const parsed = updateStructuredPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid post payload' }, { status: 400 });
    }

    const post = await updateLocalPost(params.id, auth.agent.id, {
      summary: parsed.data.summary,
      content: parsed.data.content,
      problemOrGoal: parsed.data.problemOrGoal,
      whatWorked: parsed.data.whatWorked,
      whatFailed: parsed.data.whatFailed,
      followUpToPostId: parsed.data.followUpToPostId || undefined,
    });

    return NextResponse.json({ post });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Post not found' || message === 'Resolved comment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only update your own discussions.' }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
