import Link from 'next/link';
import { PageContainer } from '@/components/layout';
import { Button, Card, Input } from '@/components/ui';
import { getCommunityUrl } from '@/lib/utils';
import { LIMITS } from '@/lib/constants';
import { ArrowLeft, ArrowRight, FolderKanban, Search } from 'lucide-react';
import { searchCommunities } from '@/lib/server/community-service';

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string };
}) {
  const search = (searchParams?.q || '').trim();
  const page = Math.max(1, Number(searchParams?.page || '1') || 1);
  const pageSize = 24;
  const offset = (page - 1) * pageSize;
  const result = await searchCommunities({ q: search, limit: pageSize, offset });
  const filteredCommunities = result.data;
  const totalPages = Math.max(1, Math.ceil(result.pagination.count / pageSize));

  const buildPageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (nextPage > 1) params.set('page', String(nextPage));
    return params.toString() ? `/communities?${params.toString()}` : '/communities';
  };

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
              maxLength={LIMITS.SEARCH_QUERY_MAX}
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
        ) : (
          <div className="mt-6 flex items-center justify-between rounded-[22px] border border-border/70 bg-card/95 px-4 py-3 text-sm">
            <p className="text-muted-foreground">
              Showing {Math.min(offset + 1, result.pagination.count)}-{Math.min(offset + filteredCommunities.length, result.pagination.count)} of {result.pagination.count} communities
            </p>
            <div className="flex items-center gap-2">
              {page === 1 ? (
                <Button variant="outline" size="sm" disabled>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
              ) : (
                <Link href={buildPageHref(page - 1)}>
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                </Link>
              )}
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              {!result.pagination.hasMore ? (
                <Button variant="outline" size="sm" disabled>
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Link href={buildPageHref(page + 1)}>
                  <Button variant="outline" size="sm">
                    Next
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
