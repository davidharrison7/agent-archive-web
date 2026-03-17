import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { humanModeratorHandles, moderationQueue, type ModerationActorRole, type ModerationQueueItem, type ModerationQueueStatus } from '@/lib/moderation-data';

export interface ModerationAuditEntry {
  id: string;
  queueItemId: string;
  actorType: 'agent' | 'human';
  actorId: string;
  actionType: 'created' | 'request_context' | 'suggest_merge' | 'escalate' | 'resolve';
  details: string;
  createdAt: string;
}

export interface HumanAdminRecord {
  id: string;
  handle: string;
  role: 'human_admin';
  grantedBy: string;
  grantedAt: string;
  revokedAt: string | null;
}

interface ModerationState {
  queue: ModerationQueueItem[];
  audit: ModerationAuditEntry[];
  humanAdmins: HumanAdminRecord[];
}

const dataDir = path.join(process.cwd(), 'data');
const moderationStateFile = path.join(dataDir, 'moderation-state.json');

function buildInitialState(): ModerationState {
  const now = new Date().toISOString();

  return {
    queue: [...moderationQueue],
    audit: [],
    humanAdmins: humanModeratorHandles.map((handle) => ({
      id: `admin-${handle}`,
      handle,
      role: 'human_admin',
      grantedBy: 'deployment-config',
      grantedAt: now,
      revokedAt: null,
    })),
  };
}

async function ensureStateFile() {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(moderationStateFile, 'utf8');
  } catch {
    await writeFile(moderationStateFile, JSON.stringify(buildInitialState(), null, 2), 'utf8');
  }
}

async function readState(): Promise<ModerationState> {
  await ensureStateFile();
  const raw = await readFile(moderationStateFile, 'utf8');
  const parsed = JSON.parse(raw) as ModerationState;

  const activeHandles = new Set(parsed.humanAdmins.filter((admin) => !admin.revokedAt).map((admin) => admin.handle));
  let changed = false;

  for (const handle of humanModeratorHandles) {
    if (!activeHandles.has(handle)) {
      parsed.humanAdmins.push({
        id: `admin-${handle}`,
        handle,
        role: 'human_admin',
        grantedBy: 'deployment-config',
        grantedAt: new Date().toISOString(),
        revokedAt: null,
      });
      changed = true;
    }
  }

  if (changed) {
    await writeState(parsed);
  }

  return parsed;
}

async function writeState(state: ModerationState) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(moderationStateFile, JSON.stringify(state, null, 2), 'utf8');
}

export async function listModerationQueue() {
  const state = await readState();
  return [...state.queue];
}

export async function listModerationAudit() {
  const state = await readState();
  return [...state.audit];
}

export async function listHumanAdmins() {
  const state = await readState();
  return state.humanAdmins.filter((admin) => !admin.revokedAt);
}

export async function isStoredHumanAdmin(handle?: string | null) {
  if (!handle) return false;
  const admins = await listHumanAdmins();
  return admins.some((admin) => admin.handle === handle.toLowerCase());
}

export async function addModerationQueueItem(item: ModerationQueueItem) {
  const state = await readState();
  state.queue.unshift(item);
  state.audit.unshift({
    id: `audit-${Date.now()}`,
    queueItemId: item.id,
    actorType: item.assignedRole === 'human_admin' ? 'human' : 'agent',
    actorId: item.assignedRole,
    actionType: 'created',
    details: item.reason,
    createdAt: new Date().toISOString(),
  });
  await writeState(state);
  return item;
}

export async function updateModerationQueueItem(
  id: string,
  updates: Partial<Pick<ModerationQueueItem, 'status' | 'suggestedAction' | 'assignedRole'>>,
  actor: { actorType: 'agent' | 'human'; actorId: string; details: string; actionType: ModerationAuditEntry['actionType'] }
) {
  const state = await readState();
  const index = state.queue.findIndex((item) => item.id === id);

  if (index === -1) {
    return null;
  }

  state.queue[index] = { ...state.queue[index], ...updates };
  state.audit.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queueItemId: id,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: actor.actionType,
    details: actor.details,
    createdAt: new Date().toISOString(),
  });
  await writeState(state);

  return state.queue[index];
}

export function buildQueueItem(input: {
  title: string;
  communitySlug: string;
  threadSlug?: string;
  status: ModerationQueueStatus;
  reason: string;
  suggestedAction: string;
  assignedRole: ModerationActorRole;
}) {
  return {
    id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...input,
  };
}
