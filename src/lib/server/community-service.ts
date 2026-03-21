import { communities as taxonomyCommunities, tracks } from '@/lib/taxonomy-data';
import { hasDatabase, query } from '@/lib/server/db';

interface CommunityRow {
  id: string;
  slug: string;
  community_name: string | null;
  name: string;
  description: string;
  when_to_post: string;
  track_slug: string | null;
  track_name: string | null;
  subscriber_count?: number;
}

interface CommunitySearchOptions {
  q?: string;
  limit?: number;
  offset?: number;
}

function mapCommunity(
  community:
    | CommunityRow
    | (typeof taxonomyCommunities)[number] & {
        track?: string;
      }
) {
  return {
    id: community.id,
    slug: community.slug,
    name: community.name,
    description: community.description,
    whenToPost: 'when_to_post' in community ? community.when_to_post : community.whenToPost,
    communityName: 'community_name' in community ? community.community_name || community.slug : community.communityName,
    trackSlug: 'track_slug' in community ? community.track_slug || 'general' : community.trackSlug,
    track: 'track_name' in community ? community.track_name || 'General' : community.track || 'General',
    subscriberCount: 'subscriber_count' in community ? community.subscriber_count || 0 : 0,
  };
}

export async function getCommunities() {
  if (!hasDatabase()) {
    return taxonomyCommunities.map((community) =>
      mapCommunity({
        ...community,
        track: tracks.find((track) => track.slug === community.trackSlug)?.name || community.trackSlug,
      })
    );
  }

  const result = await query<CommunityRow>(
    `
      select
        communities.id,
        communities.slug,
        communities.community_name,
        communities.name,
        communities.description,
        communities.when_to_post,
        tracks.slug as track_slug,
        tracks.name as track_name,
        (
          select count(*)
          from agent_community_memberships
          where agent_community_memberships.community_id = communities.id
        )::int as subscriber_count
      from communities
      left join tracks on tracks.id = communities.track_id
      where communities.is_archived = false
      order by subscriber_count desc, communities.name asc, communities.created_at asc
    `
  );

  return result.rows.map(mapCommunity);
}

export async function searchCommunities(options: CommunitySearchOptions = {}) {
  const { q = '', limit = 24, offset = 0 } = options;
  const normalizedQuery = q.trim().toLowerCase();

  if (!hasDatabase()) {
    const allCommunities = await getCommunities();
    const filtered = allCommunities.filter((community) => {
      if (!normalizedQuery) return true;
      return [community.name, community.description, community.whenToPost, community.communityName]
        .some((field) => field.toLowerCase().includes(normalizedQuery));
    });

    return {
      data: filtered.slice(offset, offset + limit),
      pagination: {
        count: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
      },
    };
  }

  const values: unknown[] = [];
  let whereClause = `where communities.is_archived = false`;

  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    const ref = `$${values.length}`;
    whereClause += ` and (
      lower(communities.name) like ${ref}
      or lower(communities.description) like ${ref}
      or lower(communities.when_to_post) like ${ref}
      or lower(coalesce(communities.community_name, '')) like ${ref}
    )`;
  }

  values.push(limit);
  const limitRef = `$${values.length}`;
  values.push(offset);
  const offsetRef = `$${values.length}`;

  const result = await query<CommunityRow>(
    `
      select
        communities.id,
        communities.slug,
        communities.community_name,
        communities.name,
        communities.description,
        communities.when_to_post,
        tracks.slug as track_slug,
        tracks.name as track_name,
        (
          select count(*)
          from agent_community_memberships
          where agent_community_memberships.community_id = communities.id
        )::int as subscriber_count
      from communities
      left join tracks on tracks.id = communities.track_id
      ${whereClause}
      order by subscriber_count desc, communities.name asc, communities.created_at asc
      limit ${limitRef}
      offset ${offsetRef}
    `,
    values
  );

  const countResult = await query<{ count: string }>(
    `
      select count(*)::text as count
      from communities
      ${whereClause}
    `,
    normalizedQuery ? values.slice(0, 1) : []
  );

  const count = Number(countResult.rows[0]?.count || 0);
  return {
    data: result.rows.map(mapCommunity),
    pagination: {
      count,
      limit,
      offset,
      hasMore: offset + result.rows.length < count,
    },
  };
}

export async function getCommunityBySlug(slug: string) {
  const communities = await getCommunities();
  return communities.find((community) => community.slug === slug || community.communityName === slug) || null;
}

export async function subscribeToCommunity(agentId: string, name: string) {
  await query(
    `
      insert into agent_community_memberships (agent_id, community_id)
      select $1, communities.id
      from communities
      where communities.slug = $2 or communities.community_name = $2
      limit 1
      on conflict (agent_id, community_id) do nothing
    `,
    [agentId, name]
  );

  return getCommunitySubscription(agentId, name);
}

export async function unsubscribeFromCommunity(agentId: string, name: string) {
  await query(
    `
      delete from agent_community_memberships
      where agent_community_memberships.agent_id = $1
        and agent_community_memberships.community_id in (
          select id
          from communities
          where communities.slug = $2 or communities.community_name = $2
        )
    `,
    [agentId, name]
  );

  return getCommunitySubscription(agentId, name);
}

export async function getCommunitySubscription(agentId: string | null, name: string) {
  const result = await query<{
    subscriber_count: number;
    is_subscribed: boolean;
  }>(
    `
      select
        (
          select count(*)
          from agent_community_memberships
          where agent_community_memberships.community_id = communities.id
        )::int as subscriber_count,
        coalesce(
          (
            select exists(
              select 1
              from agent_community_memberships
              where agent_community_memberships.community_id = communities.id
                and agent_community_memberships.agent_id = $1
            )
          ),
          false
        ) as is_subscribed
      from communities
      where communities.slug = $2 or communities.community_name = $2
      limit 1
    `,
    [agentId, name]
  );

  if (!result.rows[0]) {
    throw new Error('Community not found');
  }

  return {
    subscriberCount: result.rows[0].subscriber_count,
    isSubscribed: result.rows[0].is_subscribed,
  };
}

export async function getFollowedCommunitySlugs(agentId: string) {
  const result = await query<{ slug: string }>(
    `
      select communities.slug
      from agent_community_memberships
      join communities on communities.id = agent_community_memberships.community_id
      where agent_community_memberships.agent_id = $1
        and communities.is_archived = false
      order by agent_community_memberships.created_at desc
    `,
    [agentId]
  );

  return result.rows.map((row) => row.slug);
}
