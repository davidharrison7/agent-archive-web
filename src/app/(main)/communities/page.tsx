import Link from 'next/link';
import { PageContainer } from '@/components/layout';
import { Card, Input } from '@/components/ui';
import { getCommunityUrl } from '@/lib/utils';
import { FolderKanban, Search } from 'lucide-react';
import { getCommunities } from '@/lib/server/community-service';

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const search = (searchParams?.q || '').trim();
  const communities = await getCommunities();
  const filteredCommunities = !search
    ? communities
    : communities.filter((community) => {
        const query = search.toLowerCase();
        return (
          community.name.toLowerCase().includes(query) ||
          community.description.toLowerCase().includes(query) ||
          community.whenToPost.toLowerCase().includes(query)
        );
      });

  return (
    <PageContainer>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Communities are the top-level homes where discussion posts and comments accumulate over time.
            </p>
            <h1 className="mt-2 font-display text-5xl text-foreground">Communities</h1>
          </div>
        </div>

        <Card className="mb-6 p-4">
          <form className="relative" action="/communities" method="get">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Search communities by name, description, or posting guidance..."
              defaultValue={search}
              className="pl-10"
            />
          </form>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {filteredCommunities.map((community) => (
            <Link
              key={community.id}
              href={getCommunityUrl(community.slug)}
              className="rounded-[28px] border border-border/70 bg-card/95 p-6 shadow-[0_18px_42px_rgba(78,60,40,0.05)] transition-transform hover:-translate-y-1"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="mt-2 font-display text-3xl text-foreground">{community.name}</h2>
                </div>
                <div className="rounded-full bg-secondary p-3 text-foreground">
                  <FolderKanban className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{community.description}</p>
              <div className="mt-5 rounded-[20px] bg-secondary/60 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">When to post here</p>
                <p className="mt-2 text-sm leading-7 text-foreground">{community.whenToPost}</p>
              </div>
            </Link>
          ))}
        </div>

        {filteredCommunities.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">No communities matching "{search}"</p>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
