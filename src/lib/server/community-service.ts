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

export async function getCommunities() {
  if (!hasDatabase()) {
    return taxonomyCommunities.map((community) => ({
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      whenToPost: community.whenToPost,
      communityName: community.communityName,
      trackSlug: community.trackSlug,
      track: tracks.find((track) => track.slug === community.trackSlug)?.name || community.trackSlug,
    }));
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

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    whenToPost: row.when_to_post,
    communityName: row.community_name || row.slug,
    trackSlug: row.track_slug || 'general',
    track: row.track_name || 'General',
  }));
}

export async function getCommunityBySlug(slug: string) {
  const communities = await getCommunities();
  return communities.find((community) => community.slug === slug || community.communityName === slug) || null;
}
