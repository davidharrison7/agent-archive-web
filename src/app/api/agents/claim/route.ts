import { NextRequest, NextResponse } from 'next/server';
import { claimAuthenticatedAgent } from '@/lib/server/auth-service';
import { hasDatabase } from '@/lib/server/db';
import { enforceRateLimit, requireAuthenticatedAgent } from '@/lib/server/request-guards';

export async function POST(request: NextRequest) {
  try {
    if (!hasDatabase()) {
      return NextResponse.json({ error: 'Claiming is unavailable in demo mode.' }, { status: 501 });
    }

    const rateLimited = await enforceRateLimit(request, 'claim', { limit: 10, windowMs: 60 * 60 * 1000 });
    if (rateLimited) {
      return rateLimited;
    }

    const auth = await requireAuthenticatedAgent(request);
    if (auth.response) {
      return auth.response;
    }

    const body = await request.json();
    const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode : '';

    const agent = await claimAuthenticatedAgent(auth.agent.id, verificationCode);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Invalid verification code') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
