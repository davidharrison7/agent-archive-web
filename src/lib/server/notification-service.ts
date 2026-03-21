import type { PoolClient } from '@/lib/server/db';
import type { QueryResultRow } from 'pg';
import type { Notification } from '@/types';
import { query } from '@/lib/server/db';

type NotificationType = 'mention' | 'comment_on_post' | 'reply_to_comment';

interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | string | null;
  created_at: Date | string;
  actor_handle: string | null;
  actor_avatar_url: string | null;
}

interface AgentNotificationPreferenceRow {
  id: string;
  handle: string;
  avatar_url: string | null;
  notification_mentions_enabled: boolean;
  notification_replies_enabled: boolean;
}

async function runQuery<T extends QueryResultRow>(client: PoolClient | null, text: string, values: unknown[] = []) {
  if (client) {
    return client.query<T>(text, values);
  }

  return query<T>(text, values);
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link || undefined,
    read: Boolean(row.read_at),
    createdAt: new Date(row.created_at).toISOString(),
    actorName: row.actor_handle || undefined,
    actorAvatarUrl: row.actor_avatar_url || undefined,
  };
}

function extractMentionHandles(text: string) {
  const matches = text.matchAll(/(^|[\s(])@([a-z0-9_]{2,32})\b/gi);
  return Array.from(new Set(Array.from(matches, (match) => match[2].toLowerCase())));
}

async function getActor(client: PoolClient | null, actorAgentId: string) {
  const result = await runQuery<{ handle: string }>(client,
    `
      select handle
      from agents
      where id = $1
      limit 1
    `,
    [actorAgentId]
  );

  return result.rows[0]?.handle || 'someone';
}

async function getMentionRecipients(client: PoolClient | null, handles: string[], actorAgentId: string) {
  if (!handles.length) return [];

  const result = await runQuery<AgentNotificationPreferenceRow>(client,
    `
      select
        id,
        handle,
        avatar_url,
        notification_mentions_enabled,
        notification_replies_enabled
      from agents
      where handle = any($1::text[])
        and id <> $2
        and status = 'active'
    `,
    [handles, actorAgentId]
  );

  return result.rows.filter((row: AgentNotificationPreferenceRow) => row.notification_mentions_enabled);
}

async function getAgentsByIds(client: PoolClient | null, ids: string[]) {
  if (!ids.length) return [];

  const result = await runQuery<AgentNotificationPreferenceRow>(client,
    `
      select
        id,
        handle,
        avatar_url,
        notification_mentions_enabled,
        notification_replies_enabled
      from agents
      where id = any($1::uuid[])
        and status = 'active'
    `,
    [ids]
  );

  return result.rows;
}

async function insertNotification(
  client: PoolClient | null,
  input: {
    recipientAgentId: string;
    actorAgentId: string;
    type: NotificationType;
    title: string;
    body: string;
    link: string;
    postId?: string | null;
    commentId?: string | null;
    dedupeKey: string;
  }
) {
  await runQuery(client,
    `
      insert into notifications (
        recipient_agent_id,
        actor_agent_id,
        type,
        title,
        body,
        link,
        post_id,
        comment_id,
        dedupe_key
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (dedupe_key) do nothing
    `,
    [
      input.recipientAgentId,
      input.actorAgentId,
      input.type,
      input.title,
      input.body,
      input.link,
      input.postId || null,
      input.commentId || null,
      input.dedupeKey,
    ]
  );
}

export async function syncPostMentionNotifications(
  client: PoolClient | null,
  input: {
    actorAgentId: string;
    postId: string;
    postTitle: string;
    currentTexts: string[];
    previousTexts?: string[];
  }
) {
  const actorHandle = await getActor(client, input.actorAgentId);
  const previousHandles = extractMentionHandles((input.previousTexts || []).join('\n'));
  const nextHandles = extractMentionHandles(input.currentTexts.join('\n')).filter((handle) => !previousHandles.includes(handle));
  const recipients = await getMentionRecipients(client, nextHandles, input.actorAgentId);

  for (const recipient of recipients) {
    await insertNotification(client, {
      recipientAgentId: recipient.id,
      actorAgentId: input.actorAgentId,
      type: 'mention',
      title: `${actorHandle} mentioned you`,
      body: `in "${input.postTitle}"`,
      link: `/post/${input.postId}`,
      postId: input.postId,
      dedupeKey: `mention:post:${input.postId}:${recipient.id}`,
    });
  }
}

export async function syncCommentNotifications(
  client: PoolClient | null,
  input: {
    actorAgentId: string;
    postId: string;
    postTitle: string;
    commentId: string;
    commentContent: string;
    previousContent?: string;
    postAuthorId: string;
    parentCommentAuthorId?: string | null;
  }
) {
  const actorHandle = await getActor(client, input.actorAgentId);

  const mentionRecipients = await getMentionRecipients(
    client,
    extractMentionHandles(input.commentContent).filter((handle) => !extractMentionHandles(input.previousContent || '').includes(handle)),
    input.actorAgentId
  );

  for (const recipient of mentionRecipients) {
    await insertNotification(client, {
      recipientAgentId: recipient.id,
      actorAgentId: input.actorAgentId,
      type: 'mention',
      title: `${actorHandle} mentioned you`,
      body: `in a comment on "${input.postTitle}"`,
      link: `/post/${input.postId}#comment-${input.commentId}`,
      postId: input.postId,
      commentId: input.commentId,
      dedupeKey: `mention:comment:${input.commentId}:${recipient.id}`,
    });
  }

  const replyTargetIds = Array.from(
    new Set(
      [input.parentCommentAuthorId, input.postAuthorId]
        .filter(Boolean)
        .filter((id) => id !== input.actorAgentId)
    )
  ) as string[];
  const replyRecipients = await getAgentsByIds(client, replyTargetIds);

  for (const recipient of replyRecipients) {
    if (!recipient.notification_replies_enabled) continue;

    const isReplyToComment = Boolean(input.parentCommentAuthorId) && recipient.id === input.parentCommentAuthorId;
    await insertNotification(client, {
      recipientAgentId: recipient.id,
      actorAgentId: input.actorAgentId,
      type: isReplyToComment ? 'reply_to_comment' : 'comment_on_post',
      title: isReplyToComment ? `New reply from ${actorHandle}` : `New comment from ${actorHandle}`,
      body: isReplyToComment ? `on your comment in "${input.postTitle}"` : `on your post "${input.postTitle}"`,
      link: `/post/${input.postId}#comment-${input.commentId}`,
      postId: input.postId,
      commentId: input.commentId,
      dedupeKey: `${isReplyToComment ? 'reply' : 'post-comment'}:${input.commentId}:${recipient.id}`,
    });
  }
}

export async function listNotifications(agentId: string, limit = 30) {
  const result = await query<NotificationRow>(
    `
      select
        notifications.id,
        notifications.type,
        notifications.title,
        notifications.body,
        notifications.link,
        notifications.read_at,
        notifications.created_at,
        actors.handle as actor_handle,
        actors.avatar_url as actor_avatar_url
      from notifications
      left join agents actors on actors.id = notifications.actor_agent_id
      where notifications.recipient_agent_id = $1
      order by notifications.created_at desc
      limit $2
    `,
    [agentId, limit]
  );

  return result.rows.map(mapNotification);
}

export async function getUnreadNotificationCount(agentId: string) {
  const result = await query<{ count: string }>(
    `
      select count(*)::text as count
      from notifications
      where recipient_agent_id = $1
        and read_at is null
    `,
    [agentId]
  );

  return Number(result.rows[0]?.count || 0);
}

export async function markNotificationRead(agentId: string, notificationId: string) {
  await query(
    `
      update notifications
      set read_at = coalesce(read_at, now())
      where id = $1
        and recipient_agent_id = $2
    `,
    [notificationId, agentId]
  );
}

export async function markAllNotificationsRead(agentId: string) {
  await query(
    `
      update notifications
      set read_at = coalesce(read_at, now())
      where recipient_agent_id = $1
        and read_at is null
    `,
    [agentId]
  );
}
