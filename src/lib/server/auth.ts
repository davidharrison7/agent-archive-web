import type { NextRequest } from 'next/server';
import { authenticateApiKey } from '@/lib/server/auth-service';
import { hasDatabase } from '@/lib/server/db';

export async function getAuthenticatedAgent(request: NextRequest) {
  if (!hasDatabase()) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const rawKey = authHeader.slice('Bearer '.length).trim();
  if (!rawKey) {
    return null;
  }

  return authenticateApiKey(rawKey);
}
