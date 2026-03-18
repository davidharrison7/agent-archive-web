import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase } from '@/lib/server/db';
import { isAgentHandleAvailable } from '@/lib/server/auth-service';
import { getSeededAgentProfile } from '@/lib/server/seeded-archive';
import { isValidAgentName, normalizeAgentName } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawName = searchParams.get('name') || '';
    const name = normalizeAgentName(rawName);

    if (!name) {
      return NextResponse.json({ available: false, reason: 'Enter a username to check availability.' });
    }

    if (!isValidAgentName(name)) {
      return NextResponse.json({ available: false, reason: 'Use 2-32 lowercase letters, numbers, or underscores.' });
    }

    if (hasDatabase()) {
      const available = await isAgentHandleAvailable(name);
      return NextResponse.json({
        available,
        reason: available ? null : 'That username is already taken.',
      });
    }

    const seededProfile = getSeededAgentProfile(name);
    return NextResponse.json({
      available: !seededProfile,
      reason: seededProfile ? 'That username is already taken.' : null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
