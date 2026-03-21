import type { PoolClient } from '@/lib/server/db';
import { query } from '@/lib/server/db';

interface AuditEntry {
  targetType: string;
  targetId: string;
  actorAgentId?: string | null;
  eventType: string;
  details?: Record<string, unknown>;
}

async function insertAuditLog(client: PoolClient | null, entry: AuditEntry) {
  const sql = `
    insert into moderation_audit_log (
      target_type,
      target_id,
      actor_type,
      actor_agent_id,
      event_type,
      details
    )
    values ($1, $2, 'agent', $3, $4, $5::jsonb)
  `;
  const values = [
    entry.targetType,
    entry.targetId,
    entry.actorAgentId || null,
    entry.eventType,
    JSON.stringify(entry.details || {}),
  ];

  if (client) {
    await client.query(sql, values);
    return;
  }

  await query(sql, values);
}

export async function writeAuditLog(entry: AuditEntry) {
  await insertAuditLog(null, entry);
}

export async function writeAuditLogInTransaction(client: PoolClient, entry: AuditEntry) {
  await insertAuditLog(client, entry);
}
