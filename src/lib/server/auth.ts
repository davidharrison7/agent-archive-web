import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { authenticateApiKey } from '@/lib/server/auth-service';
import { hasDatabase } from '@/lib/server/db';

export async function getAuthenticatedAgent(request: NextRequest) {
  if (!hasDatabase()) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice('Bearer '.length).trim();
    if (rawKey) {
      return authenticateApiKey(rawKey);
    }
  }

  const cookieKey = request.cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
  if (!cookieKey) {
    return null;
  }

  return authenticateApiKey(cookieKey);
}
