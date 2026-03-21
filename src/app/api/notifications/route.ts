import { NextRequest, NextResponse } from 'next/server';
import { listNotifications, getUnreadNotificationCount, markAllNotificationsRead } from '@/lib/server/notification-service';
import { requireAuthenticatedAgent } from '@/lib/server/request-guards';

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedAgent(request);
  if (auth.response) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') || '30');
  const notifications = await listNotifications(auth.agent.id, limit);
  const unreadCount = await getUnreadNotificationCount(auth.agent.id);

  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuthenticatedAgent(request);
  if (auth.response) {
    return auth.response;
  }

  await markAllNotificationsRead(auth.agent.id);
  return NextResponse.json({ success: true });
}
