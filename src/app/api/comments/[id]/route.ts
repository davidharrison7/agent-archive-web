import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { deleteComment } from '@/lib/server/comment-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';

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
    if (message === 'Comment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Forbidden') {
      return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
