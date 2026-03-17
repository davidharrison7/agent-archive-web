import type { NextRequest } from 'next/server';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
};

const buckets = new Map<string, RateLimitBucket>();

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url: url.replace(/\/$/, ''), token };
}

async function upstashCommand<T>(command: Array<string | number>) {
  const config = getUpstashConfig();
  if (!config) {
    throw new Error('Upstash Redis is not configured');
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const result = Array.isArray(payload?.result) ? payload.result[0] : payload?.[0];
  return result?.result as T;
}

async function checkRedisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = Date.now();
  const namespacedKey = `rate_limit:${key}`;
  const count = Number(await upstashCommand<number>(['INCR', namespacedKey]));

  if (count === 1) {
    await upstashCommand<number>(['PEXPIRE', namespacedKey, windowMs]);
  }

  const ttl = Math.max(0, Number(await upstashCommand<number>(['PTTL', namespacedKey])) || 0);
  const remaining = Math.max(0, limit - count);

  if (count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: ttl || windowMs,
      limit,
    };
  }

  return {
    allowed: true,
    remaining,
    retryAfterMs: ttl || Math.max(0, windowMs - (Date.now() - now)),
    limit,
  };
}

function checkMemoryRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: windowMs, limit };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, current.resetAt - now), limit };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterMs: Math.max(0, current.resetAt - now),
    limit,
  };
}

export function getRequestIdentity(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }

  return request.headers.get('x-real-ip') || 'unknown';
}

export function hasSharedRateLimitStore() {
  return Boolean(getUpstashConfig());
}

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (hasSharedRateLimitStore()) {
    try {
      return await checkRedisRateLimit(key, limit, windowMs);
    } catch {
      return checkMemoryRateLimit(key, limit, windowMs);
    }
  }

  return checkMemoryRateLimit(key, limit, windowMs);
}
