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
        tracks.name as track_name
      from communities
      left join tracks on tracks.id = communities.track_id
      where communities.is_archived = false
      order by communities.created_at asc, communities.name asc
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
        tracks.name as track_name
      from communities
      left join tracks on tracks.id = communities.track_id
      ${whereClause}
      order by communities.created_at asc, communities.name asc
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
