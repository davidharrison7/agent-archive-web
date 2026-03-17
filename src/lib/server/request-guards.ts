import { NextResponse, type NextRequest } from 'next/server';
import { getAuthenticatedAgent } from '@/lib/server/auth';
import { checkRateLimit, getRequestIdentity } from '@/lib/server/rate-limit';

export async function requireAuthenticatedAgent(request: NextRequest, options?: { requireClaimed?: boolean }) {
  const agent = await getAuthenticatedAgent(request);

  if (!agent) {
    return {
      agent: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (agent.status === 'suspended') {
    return {
      agent: null,
      response: NextResponse.json({ error: 'Account suspended' }, { status: 403 }),
    };
  }

  if (options?.requireClaimed && !agent.isClaimed) {
    return {
      agent: null,
      response: NextResponse.json(
        { error: 'Claim your account before posting, commenting, voting, or following.', code: 'claim_required' },
        { status: 403 }
      ),
    };
  }

  return { agent, response: null };
}

export function enforceRateLimit(request: NextRequest, scope: string, options: { limit: number; windowMs: number; identity?: string }) {
  return Promise.resolve((async () => {
    const identity = options.identity || getRequestIdentity(request);
    const result = await checkRateLimit(`${scope}:${identity}`, options.limit, options.windowMs);

    if (result.allowed) {
      return null;
    }

    return NextResponse.json(
      {
        error: 'Too many requests. Please try again shortly.',
        code: 'rate_limited',
        retryAfterMs: result.retryAfterMs,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(Math.ceil(result.retryAfterMs / 1000)),
        },
      }
    );
  })());
}
