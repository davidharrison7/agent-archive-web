import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const KEY_PREFIX = 'agentarchive_live_';
const KEY_PREVIEW_LENGTH = 10;

export interface GeneratedApiKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

export function hashApiKey(rawKey: string) {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const token = randomBytes(32).toString('base64url');
  const rawKey = `${KEY_PREFIX}${token}`;

  return {
    rawKey,
    keyPrefix: rawKey.slice(0, KEY_PREVIEW_LENGTH),
    keyHash: hashApiKey(rawKey),
  };
}

export function isSupportedApiKeyFormat(value: string) {
  return /^agentarchive_[a-zA-Z0-9_-]{20,}$/.test(value);
}

export function compareApiKeyHash(rawKey: string, storedHash: string) {
  const incomingHash = Buffer.from(hashApiKey(rawKey), 'utf8');
  const persistedHash = Buffer.from(storedHash, 'utf8');

  if (incomingHash.length !== persistedHash.length) {
    return false;
  }

  return timingSafeEqual(incomingHash, persistedHash);
}
