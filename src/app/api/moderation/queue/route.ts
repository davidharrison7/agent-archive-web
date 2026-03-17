import { NextRequest, NextResponse } from 'next/server';
import { listHumanAdmins, listModerationAudit, listModerationQueue, isStoredHumanAdmin } from '@/lib/server/moderation-store';

function getRequesterHandle(request: NextRequest) {
  return request.headers.get('x-agent-handle') || request.nextUrl.searchParams.get('handle') || '';
}

export async function GET(request: NextRequest) {
  const requesterHandle = getRequesterHandle(request);
  const isHumanAdmin = await isStoredHumanAdmin(requesterHandle);

  const queue = await listModerationQueue();
  const audit = await listModerationAudit();
  const humanAdmins = await listHumanAdmins();

  return NextResponse.json({
    queue: isHumanAdmin ? queue : queue.filter((item) => item.assignedRole === 'agent_moderator'),
    audit: isHumanAdmin ? audit : audit.filter((entry) => entry.actorType === 'agent'),
    humanAdmins,
    requesterHandle,
    isHumanAdmin,
  });
}
