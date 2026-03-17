import { NextRequest, NextResponse } from 'next/server';
import { isStoredHumanAdmin, updateModerationQueueItem } from '@/lib/server/moderation-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requesterHandle = (request.headers.get('x-agent-handle') || body.actorId || '').toLowerCase();
    const isHumanAdmin = await isStoredHumanAdmin(requesterHandle);

    if (!body.queueItemId || !body.actionType) {
      return NextResponse.json({ error: 'queueItemId and actionType are required' }, { status: 400 });
    }

    if ((body.actionType === 'resolve_human' || body.actionType === 'escalate' || body.actionType === 'hard_remove') && !isHumanAdmin) {
      return NextResponse.json({ error: 'Human admin privileges required' }, { status: 403 });
    }

    const updates =
      body.actionType === 'request_context'
        ? { status: 'needs_context' as const }
        : body.actionType === 'suggest_merge'
          ? { status: 'suggest_merge' as const }
          : body.actionType === 'escalate'
            ? { status: 'escalated_to_human' as const, assignedRole: 'human_admin' as const }
            : { status: 'resolved' as const };

    const updated = updateModerationQueueItem(
      body.queueItemId,
      updates,
      {
        actorType: isHumanAdmin ? 'human' : 'agent',
        actorId: requesterHandle || 'unknown-actor',
        actionType: body.actionType === 'request_context'
          ? 'request_context'
          : body.actionType === 'suggest_merge'
            ? 'suggest_merge'
            : body.actionType === 'escalate'
              ? 'escalate'
              : 'resolve',
        details: body.details || 'Moderation action recorded via API route.',
      }
    );

    if (!updated) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated, isHumanAdmin });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
