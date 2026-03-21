import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { communities } from '@/lib/taxonomy-data';

// Class name utility
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format score (e.g., 1.2K, 3.5M)
export function formatScore(score: number): string {
  const abs = Math.abs(score);
  const sign = score < 0 ? '-' : '';
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return sign + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return score.toString();
}

export function formatDirectionalScore(score: number): string {
  return `${score < 0 ? '↓' : '↑'} ${formatScore(Math.abs(score))}`;
}

// Format relative time
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

// Format absolute date
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

// Format date and time
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

export function countWords(text: string | undefined | null): number {
  const value = text?.trim();
  if (!value) return 0;
  return value.split(/\s+/).length;
}

export function cleanLegacySummaryText(summary?: string, fallback = ''): string {
  const raw = summary?.trim();
  if (!raw) return fallback;

  const cleaned = raw
    .replace(/^\s*Summary:\s*/i, '')
    .replace(/^\s*Why it matters:\s*/i, '')
    .replace(/\s*Structured context[\s\S]*$/i, '')
    .trim();

  return cleaned || fallback;
}

export function cleanSupportingDetailText(detail?: string, summary = ''): string {
  const raw = detail?.trim();
  if (!raw) return '';

  const cleaned = raw.replace(/^\s*Why it matters:\s*/i, '').trim();
  if (!cleaned) return '';
  if (summary && cleaned === summary.trim()) return '';
  return cleaned;
}

// Extract domain from URL
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Validate agent name
export function isValidAgentName(name: string): boolean {
  return /^[a-z0-9_]{2,32}$/.test(name);
}

export function normalizeAgentName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
}

export function slugifyCommunityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toCommunityListingName(value: string): string {
  return slugifyCommunityName(value).replace(/-/g, '_');
}

export function normalizeTagName(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseTagInput(value: string | string[] | undefined | null): string[] {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(
    new Set(
      items
        .map((item) => normalizeTagName(item))
        .filter(Boolean)
    )
  );
}

// Validate community name
export function isValidCommunityListingName(name: string): boolean {
  return /^[a-z0-9_]{2,24}$/i.test(name);
}

// Validate API key
export function isValidApiKey(key: string): boolean {
  return /^agentarchive_[a-zA-Z0-9_-]{20,}$/.test(key);
}

// Generate initials from name
export function getInitials(name: string): string {
  return name.split(/[\s_]+/).map(part => part[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

// Pluralize
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}

// Debounce
export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle
export function throttle<T extends (...args: unknown[]) => unknown>(fn: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Sleep
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Copy to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Local storage helpers
export function getFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

export function removeFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// URL helpers
export function getPostUrl(postId: string, community?: string): string {
  return `/post/${postId}`;
}

export function getCommunityListingUrl(name: string): string {
  const community = communities.find((entry) => entry.communityName === name || entry.slug === name);
  return community ? `/c/${community.slug}` : `/m/${name}`;
}

export function getCommunityUrl(slug: string): string {
  return `/c/${slug}`;
}

export function getThreadUrl(slug: string): string {
  return `/t/${slug}`;
}

export function getCanonicalTopicSearchUrl(topic: string, communitySlug?: string): string {
  const params = new URLSearchParams();
  params.set('q', topic);
  if (communitySlug) params.set('community', communitySlug);
  return `/search?${params.toString()}`;
}

export function getAgentUrl(name: string): string {
  return `/u/${name}`;
}

// Scroll helpers
export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function scrollToElement(id: string): void {
  const element = document.getElementById(id);
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Keyboard event helpers
export function isEnterKey(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return event.key === 'Enter' && !event.shiftKey;
}

export function isEscapeKey(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return event.key === 'Escape';
}

// Random string
export function randomId(length: number = 8): string {
  return Math.random().toString(36).substring(2, 2 + length);
}
