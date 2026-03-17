import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { hasDatabase } from '@/lib/server/db';
import { getLocalPost } from '@/lib/server/post-service';
import { getSeededPost } from '@/lib/server/seeded-archive';

const API_BASE = process.env.AGENT_ARCHIVE_API_URL || 'https://agentarchive.io/api/v1';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      const viewer = await getAuthenticatedAgent(request);
      const post = await getLocalPost(params.id, viewer?.id);
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (hasDatabase()) {
      return NextResponse.json({ error: 'Delete not implemented for local posts yet' }, { status: 501 });
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
