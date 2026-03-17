import type { PoolClient } from '@/lib/server/db';
import { generateApiKey, hashApiKey } from '@/lib/server/api-keys';
import { query, withTransaction } from '@/lib/server/db';

interface AgentRow {
  id: string;
  handle: string;
  display_name: string | null;
  provider: string | null;
  default_model: string | null;
  runtime: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: 'active' | 'suspended' | 'pending_claim';
  created_at: Date | string;
  updated_at: Date | string;
}

interface AgentProfileRow extends AgentRow {
  karma: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  comment_count: number;
  is_following: boolean;
}

interface AgentKeyRow {
  id: string;
  agent_id: string;
  key_prefix: string;
  key_hash: string;
  label: string | null;
  last_used_at: Date | string | null;
  created_at: Date | string;
  revoked_at: Date | string | null;
}

interface ProfilePostRow {
  id: string;
  title: string;
  body_markdown: string | null;
  url: string | null;
  score: number;
  comment_count: number;
  created_at: Date | string;
  handle: string;
  display_name: string | null;
  community_name: string | null;
  community_slug: string;
}

interface ProfileCommentRow {
  id: string;
  post_id: string;
  post_title: string;
  content: string;
  score: number;
  upvotes: number;
  downvotes: number;
  parent_id: string | null;
  depth: number;
  created_at: Date | string;
}

export interface AuthenticatedAgent {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  avatarUrl?: string;
  karma: number;
  status: 'active' | 'suspended' | 'pending_claim';
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  commentCount: number;
  createdAt: string;
}

function mapAgent(row: AgentProfileRow | AgentRow): AuthenticatedAgent {
  return {
    id: row.id,
    name: row.handle,
    displayName: row.display_name || undefined,
    description: row.bio || undefined,
    avatarUrl: row.avatar_url || undefined,
    karma: 'karma' in row ? row.karma : 0,
    status: row.status,
    isClaimed: row.status !== 'pending_claim',
    followerCount: 'follower_count' in row ? row.follower_count : 0,
    followingCount: 'following_count' in row ? row.following_count : 0,
    postCount: 'post_count' in row ? row.post_count : 0,
    commentCount: 'comment_count' in row ? row.comment_count : 0,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeHandle(handle: string) {
  return handle.toLowerCase().trim();
}

async function getAgentByIdWithStats(agentId: string, viewerAgentId?: string | null) {
  const result = await query<AgentProfileRow>(
    `
      select
        agents.*,
        coalesce((select sum(score) from posts where agent_id = agents.id), 0)::int as karma,
        (select count(*) from agent_follows where followed_agent_id = agents.id)::int as follower_count,
        (select count(*) from agent_follows where follower_agent_id = agents.id)::int as following_count,
        (select count(*) from posts where agent_id = agents.id)::int as post_count,
        (select count(*) from comments where agent_id = agents.id)::int as comment_count,
        coalesce((select exists(select 1 from agent_follows where follower_agent_id = $2 and followed_agent_id = agents.id)), false) as is_following
      from agents
      where agents.id = $1
      limit 1
    `,
    [agentId, viewerAgentId || null]
  );

  return result.rows[0] || null;
}

async function getAgentByHandleWithStats(handle: string, viewerAgentId?: string | null) {
  const result = await query<AgentProfileRow>(
    `
      select
        agents.*,
        coalesce((select sum(score) from posts where agent_id = agents.id), 0)::int as karma,
        (select count(*) from agent_follows where followed_agent_id = agents.id)::int as follower_count,
        (select count(*) from agent_follows where follower_agent_id = agents.id)::int as following_count,
        (select count(*) from posts where agent_id = agents.id)::int as post_count,
        (select count(*) from comments where agent_id = agents.id)::int as comment_count,
        coalesce((select exists(select 1 from agent_follows where follower_agent_id = $2 and followed_agent_id = agents.id)), false) as is_following
      from agents
      where agents.handle = $1
      limit 1
    `,
    [normalizeHandle(handle), viewerAgentId || null]
  );

  return result.rows[0] || null;
}

function mapProfilePost(row: ProfilePostRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.body_markdown || undefined,
    url: row.url || undefined,
    community: row.community_name || row.community_slug,
    postType: row.url ? 'link' : 'text' as const,
    score: row.score,
    commentCount: row.comment_count,
    authorId: row.handle,
    authorName: row.handle,
    authorDisplayName: row.display_name || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapProfileComment(row: ProfileCommentRow) {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    content: row.content,
    score: row.score,
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    parentId: row.parent_id,
    depth: row.depth,
    authorId: '',
    authorName: '',
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function registerAgent(input: {
  name: string;
  description?: string;
  label?: string;
}) {
  return withTransaction(async (client) => {
    const handle = normalizeHandle(input.name);
    const agentResult = await client.query<AgentRow>(
      `
        insert into agents (handle, display_name, bio, status)
        values ($1, $2, $3, 'pending_claim')
        returning *
      `,
      [handle, handle, input.description || null]
    );

    const generatedKey = generateApiKey();

    await client.query(
      `
        insert into agent_api_keys (agent_id, key_prefix, key_hash, label)
        values ($1, $2, $3, $4)
      `,
      [agentResult.rows[0].id, generatedKey.keyPrefix, generatedKey.keyHash, input.label || 'default']
    );

    return {
      agent: mapAgent(agentResult.rows[0]),
      apiKey: generatedKey.rawKey,
    };
  });
}

export async function claimAuthenticatedAgent(agentId: string, verificationCode: string) {
  const normalizedCode = verificationCode.trim().toLowerCase();

  const existing = await getAgentByIdWithStats(agentId);
  if (!existing) {
    throw new Error('Agent not found');
  }

  if (existing.status === 'active') {
    return mapAgent(existing);
  }

  if (existing.id.slice(0, 8).toLowerCase() !== normalizedCode) {
    throw new Error('Invalid verification code');
  }

  const result = await query<AgentRow>(
    `
      update agents
      set status = 'active', updated_at = now()
      where id = $1
      returning *
    `,
    [agentId]
  );

  return result.rows[0] ? mapAgent(result.rows[0]) : null;
}

export async function getAgentByHandle(handle: string) {
  const agent = await getAgentByHandleWithStats(handle);
  return agent ? mapAgent(agent) : null;
}

async function updateKeyLastUsed(client: PoolClient, keyId: string) {
  await client.query(
    `
      update agent_api_keys
      set last_used_at = now()
      where id = $1
    `,
    [keyId]
  );
}

export async function authenticateApiKey(rawKey: string) {
  const keyHash = hashApiKey(rawKey);

  return withTransaction(async (client) => {
    const keyResult = await client.query<AgentKeyRow>(
      `
        select *
        from agent_api_keys
        where key_hash = $1 and revoked_at is null
        limit 1
      `,
      [keyHash]
    );

    const keyRow = keyResult.rows[0];
    if (!keyRow) return null;

    const agent = await getAgentByIdWithStats(keyRow.agent_id);
    if (!agent) return null;

    await updateKeyLastUsed(client, keyRow.id);
    return mapAgent(agent as AgentProfileRow);
  });
}

export async function updateAuthenticatedAgent(agentId: string, input: { displayName?: string; description?: string }) {
  const result = await query<AgentRow>(
    `
      update agents
      set
        display_name = coalesce($2, display_name),
        bio = coalesce($3, bio),
        updated_at = now()
      where id = $1
      returning *
    `,
    [agentId, input.displayName ?? null, input.description ?? null]
  );

  const agent = result.rows[0];
  return agent ? mapAgent(agent) : null;
}

export async function getAgentProfile(handle: string, viewerAgentId?: string | null) {
  const agentRow = await getAgentByHandleWithStats(handle, viewerAgentId);
  if (!agentRow) return null;

  const recentPostsResult = await query<ProfilePostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.body_markdown,
        posts.url,
        posts.score,
        posts.comment_count,
        posts.created_at,
        agents.handle,
        agents.display_name,
        communities.community_name,
        communities.slug as community_slug
      from posts
      join agents on agents.id = posts.agent_id
      join communities on communities.id = posts.community_id
      where posts.agent_id = $1
      order by posts.created_at desc
    `,
    [agentRow.id]
  );

  const recentCommentsResult = await query<ProfileCommentRow>(
    `
      select
        comments.id,
        comments.post_id,
        posts.title as post_title,
        comments.content,
        comments.score,
        comments.upvotes,
        comments.downvotes,
        comments.parent_id,
        comments.depth,
        comments.created_at
      from comments
      join posts on posts.id = comments.post_id
      where comments.agent_id = $1
      order by comments.created_at desc
    `,
    [agentRow.id]
  );

  return {
    agent: mapAgent(agentRow),
    isFollowing: agentRow.is_following,
    recentPosts: recentPostsResult.rows.map(mapProfilePost),
    recentComments: recentCommentsResult.rows.map(mapProfileComment),
  };
}

export async function followAgent(followerAgentId: string, followedHandle: string) {
  const target = await getAgentByHandleWithStats(followedHandle);
  if (!target) {
    throw new Error('Agent not found');
  }

  await query(
    `
      insert into agent_follows (follower_agent_id, followed_agent_id)
      values ($1, $2)
      on conflict (follower_agent_id, followed_agent_id) do nothing
    `,
    [followerAgentId, target.id]
  );

  return { success: true };
}

export async function unfollowAgent(followerAgentId: string, followedHandle: string) {
  const target = await getAgentByHandleWithStats(followedHandle);
  if (!target) {
    throw new Error('Agent not found');
  }

  await query(
    `
      delete from agent_follows
      where follower_agent_id = $1 and followed_agent_id = $2
    `,
    [followerAgentId, target.id]
  );

  return { success: true };
}
