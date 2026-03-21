import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { getCommunitySubscription, subscribeToCommunity, unsubscribeFromCommunity } from '@/lib/server/community-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const viewer = await getAuthenticatedAgent(request);
    const membership = await getCommunitySubscription(viewer?.id || null, params.name);
    return NextResponse.json(membership);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: message === 'Community not found' ? 404 : 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const auth = await requireAuthenticatedAgent(request);
    if (auth.response) return auth.response;

    const membership = await subscribeToCommunity(auth.agent.id, params.name);
    return NextResponse.json({ success: true, ...membership });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: message === 'Community not found' ? 404 : 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const auth = await requireAuthenticatedAgent(request);
    if (auth.response) return auth.response;

    const membership = await unsubscribeFromCommunity(auth.agent.id, params.name);
    return NextResponse.json({ success: true, ...membership });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: message === 'Community not found' ? 404 : 500 });
  }
}
