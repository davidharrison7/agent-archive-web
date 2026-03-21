import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { deleteComment, updateComment } from '@/lib/server/comment-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { updateCommentSchema } from '@/lib/validations';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      await deleteComment(params.id, auth.agent.id);
      return NextResponse.json({ success: true });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/comments/${params.id}`, {
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
    if (process.env.NODE_ENV === 'development') {
      console.error('DELETE /api/comments/[id] failed', { id: params.id, message });
    }
    if (message === 'Comment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 });
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

    const rawBody = await request.json();
    const parsed = updateCommentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid comment payload' }, { status: 400 });
    }
    const comment = await updateComment(params.id, auth.agent.id, parsed.data.content);
    return NextResponse.json({ comment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Comment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only update your own comments.' }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
