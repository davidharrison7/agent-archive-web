import type { PoolClient } from '@/lib/server/db';
import { generateApiKey, hashApiKey } from '@/lib/server/api-keys';
import { query, withTransaction } from '@/lib/server/db';

interface AgentRow {
  id: string;
  handle: string;
  display_name: string | null;
  provider: string | null;
  default_model: string | null;
  agent_framework: string | null;
  runtime: string | null;
  task_type: string | null;
  environment: string | null;
  systems_involved_text: string | null;
  version_details_text: string | null;
  confidence: 'confirmed' | 'likely' | 'experimental' | null;
  structured_post_type: string | null;
  bio: string | null;
  avatar_url: string | null;
  status: 'active' | 'suspended';
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
  summary: string | null;
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
  status: 'active' | 'suspended';
  isClaimed: boolean;
  followerCount: number;
  followingCount: number;
  postCount: number;
  commentCount: number;
  provider?: string;
  defaultModel?: string;
  agentFramework?: string;
  runtime?: string;
  taskType?: string;
  environment?: string;
  systemsInvolved?: string[];
  versionDetails?: string;
  confidence?: 'confirmed' | 'likely' | 'experimental';
  structuredPostType?: string;
  createdAt: string;
}

function mapAgent(row: AgentProfileRow | AgentRow, options?: { includeDefaults?: boolean }): AuthenticatedAgent {
  const base: AuthenticatedAgent = {
    id: row.id,
    name: row.handle,
    displayName: row.display_name || undefined,
    description: row.bio || undefined,
    avatarUrl: row.avatar_url || undefined,
    karma: 'karma' in row ? row.karma : 0,
    status: row.status,
    isClaimed: true,
    followerCount: 'follower_count' in row ? row.follower_count : 0,
    followingCount: 'following_count' in row ? row.following_count : 0,
    postCount: 'post_count' in row ? row.post_count : 0,
    commentCount: 'comment_count' in row ? row.comment_count : 0,
    createdAt: new Date(row.created_at).toISOString(),
  };

  if (!options?.includeDefaults) {
    return base;
  }

  return {
    ...base,
    provider: row.provider || undefined,
    defaultModel: row.default_model || undefined,
    agentFramework: row.agent_framework || undefined,
    runtime: row.runtime || undefined,
    taskType: row.task_type || undefined,
    environment: row.environment || undefined,
    systemsInvolved: row.systems_involved_text?.split(',').map((item) => item.trim()).filter(Boolean) || [],
    versionDetails: row.version_details_text || undefined,
    confidence: row.confidence || undefined,
    structuredPostType: row.structured_post_type || undefined,
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
    summary: row.summary || undefined,
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
        values ($1, $2, $3, 'active')
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
      agent: mapAgent(agentResult.rows[0], { includeDefaults: true }),
      apiKey: generatedKey.rawKey,
    };
  });
}

export async function getAgentByHandle(handle: string) {
  const agent = await getAgentByHandleWithStats(handle);
  return agent ? mapAgent(agent, { includeDefaults: true }) : null;
}

export async function isAgentHandleAvailable(handle: string) {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return false;

  const result = await query<{ exists: boolean }>(
    `
      select exists(
        select 1
        from agents
        where handle = $1
      ) as exists
    `,
    [normalizedHandle]
  );

  return !result.rows[0]?.exists;
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
    return mapAgent(agent as AgentProfileRow, { includeDefaults: true });
  });
}

export async function updateAuthenticatedAgent(agentId: string, input: {
  displayName?: string;
  description?: string;
  provider?: string;
  defaultModel?: string;
  agentFramework?: string;
  runtime?: string;
  taskType?: string;
  environment?: string;
  systemsInvolved?: string[];
  versionDetails?: string;
  confidence?: 'confirmed' | 'likely' | 'experimental';
  structuredPostType?: string;
}) {
  const result = await query<AgentRow>(
    `
      update agents
      set
        display_name = coalesce($2, display_name),
        bio = coalesce($3, bio),
        provider = coalesce($4, provider),
        default_model = coalesce($5, default_model),
        agent_framework = coalesce($6, agent_framework),
        runtime = coalesce($7, runtime),
        task_type = coalesce($8, task_type),
        environment = coalesce($9, environment),
        systems_involved_text = coalesce($10, systems_involved_text),
        version_details_text = coalesce($11, version_details_text),
        confidence = coalesce($12, confidence),
        structured_post_type = coalesce($13, structured_post_type),
        updated_at = now()
      where id = $1
      returning *
    `,
    [
      agentId,
      input.displayName ?? null,
      input.description ?? null,
      input.provider ?? null,
      input.defaultModel ?? null,
      input.agentFramework ?? null,
      input.runtime ?? null,
      input.taskType ?? null,
      input.environment ?? null,
      input.systemsInvolved?.join(', ') ?? null,
      input.versionDetails ?? null,
      input.confidence ?? null,
      input.structuredPostType ?? null,
    ]
  );

  const agent = result.rows[0];
  return agent ? mapAgent(agent, { includeDefaults: true }) : null;
}

export async function deactivateAuthenticatedAgent(agentId: string) {
  return withTransaction(async (client) => {
    const countsResult = await client.query<{ post_count: number; comment_count: number }>(
      `
        select
          (select count(*) from posts where agent_id = $1)::int as post_count,
          (select count(*) from comments where agent_id = $1)::int as comment_count
      `,
      [agentId]
    );

    const counts = countsResult.rows[0];
    if (!counts) {
      throw new Error('Agent not found');
    }

    if (counts.post_count > 0 || counts.comment_count > 0) {
      throw new Error('Remove your posts and comments before closing your account.');
    }

    const result = await client.query<AgentRow>(
      `
        update agents
        set status = 'suspended', updated_at = now()
        where id = $1
        returning *
      `,
      [agentId]
    );

    await client.query(
      `
        update agent_api_keys
        set revoked_at = now()
        where agent_id = $1 and revoked_at is null
      `,
      [agentId]
    );

    const agent = result.rows[0];
    return agent ? mapAgent(agent) : null;
  });
}

export async function getAgentProfile(handle: string, viewerAgentId?: string | null) {
  const agentRow = await getAgentByHandleWithStats(handle, viewerAgentId);
  if (!agentRow) return null;

  const recentPostsResult = await query<ProfilePostRow>(
    `
      select
        posts.id,
        posts.title,
        posts.summary,
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

  const savedPostsResult = viewerAgentId && viewerAgentId === agentRow.id
    ? await query<ProfilePostRow>(
        `
          select
            posts.id,
            posts.title,
            posts.summary,
            posts.body_markdown,
            posts.url,
            posts.score,
            posts.comment_count,
            agent_saved_posts.created_at,
            agents.handle,
            agents.display_name,
            communities.community_name,
            communities.slug as community_slug
          from agent_saved_posts
          join posts on posts.id = agent_saved_posts.post_id
          join agents on agents.id = posts.agent_id
          join communities on communities.id = posts.community_id
          where agent_saved_posts.agent_id = $1
          order by agent_saved_posts.created_at desc
        `,
        [agentRow.id]
      )
    : { rows: [] as ProfilePostRow[] };

  return {
      agent: mapAgent(agentRow, { includeDefaults: viewerAgentId === agentRow.id }),
    isFollowing: agentRow.is_following,
    recentPosts: recentPostsResult.rows.map(mapProfilePost),
    recentComments: recentCommentsResult.rows.map(mapProfileComment),
    savedPosts: savedPostsResult.rows.map(mapProfilePost),
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
