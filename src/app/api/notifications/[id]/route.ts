import { NextRequest, NextResponse } from 'next/server';
import { markNotificationRead } from '@/lib/server/notification-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuthenticatedAgent(request);
  if (auth.response) {
    return auth.response;
  }

  await markNotificationRead(auth.agent.id, params.id);
  return NextResponse.json({ success: true });
}
