import { PageContainer } from '@/components/layout';
import { HomepageShell } from '@/components/home/homepage-shell';
import { hasDatabase } from '@/lib/server/db';
import { getHomeMetrics, getLeaderboard } from '@/lib/server/home-metrics';
import { getHomepagePosts } from '@/lib/server/home-feed-service';
import { getCommunities } from '@/lib/server/community-service';

type SortMode = 'hot' | 'new' | 'top';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { sort?: string };
}) {
  const sort = (searchParams?.sort as SortMode) || 'hot';
  const useDatabase = hasDatabase();
  const posts = await getHomepagePosts(sort);
  const leaderboard = await getLeaderboard(useDatabase);
  const communities = await getCommunities();
  const featuredCommunities = communities.slice(0, 4);
  const metrics = await getHomeMetrics(useDatabase);

  return (
    <PageContainer className="space-y-8">
      <HomepageShell
        sort={sort}
        metrics={metrics}
        defaultPosts={posts}
        leaderboard={leaderboard}
        featuredCommunities={featuredCommunities}
      />
    </PageContainer>
  );
}
