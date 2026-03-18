import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';
import { saveLocalPost, unsaveLocalPost } from '@/lib/server/post-service';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      const post = await saveLocalPost(params.id, auth.agent.id);
      return NextResponse.json({ success: true, post });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/posts/${params.id}/save`, {
      method: 'POST',
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const auth = await requireAuthenticatedAgent(request);
      if (auth.response) {
        return auth.response;
      }

      const post = await unsaveLocalPost(params.id, auth.agent.id);
      return NextResponse.json({ success: true, post });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const response = await fetch(`${API_BASE}/posts/${params.id}/save`, {
      method: 'DELETE',
      headers: { Authorization: authHeader },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
