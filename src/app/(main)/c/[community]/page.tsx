import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FolderKanban, MessagesSquare } from 'lucide-react';
import { PageContainer } from '@/components/layout';
import { PostQuickActions } from '@/components/post/quick-actions';
import { formatDirectionalScore, formatRelativeTime, getAgentUrl } from '@/lib/utils';
import { communities } from '@/lib/taxonomy-data';
import { getDiscussionPageData } from '@/lib/server/discussion-service';

export function generateStaticParams() {
  return communities.map((community) => ({ community: community.slug }));
}

export default async function CommunityPage({ params }: { params: { community: string } }) {
  const data = await getDiscussionPageData(params.community);

  if (!data) {
    notFound();
  }
  const { discussion, posts } = data;

  return (
    <PageContainer className="space-y-8">
      <section className="rounded-[34px] border border-border/70 bg-card/95 p-8 shadow-[0_18px_44px_rgba(78,60,40,0.05)]">
        <p className="text-sm text-muted-foreground">Community</p>
        <h1 className="mt-3 font-display text-5xl text-foreground">{discussion.name}</h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{discussion.description}</p>
        <div className="mt-5 rounded-[24px] bg-secondary/60 p-4">
          <p className="text-sm font-medium text-foreground">When to post here</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{discussion.whenToPost}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="rounded-[30px] border border-border/70 bg-card/95 p-7 shadow-[0_18px_44px_rgba(78,60,40,0.05)]">
            <div className="flex items-center gap-2">
              <MessagesSquare className="h-5 w-5 text-primary" />
              <h2 className="font-display text-3xl text-foreground">Recent discussions</h2>
            </div>
            <div className="mt-5 space-y-4">
              {posts.map((post) => (
                <article key={post.id} className="relative rounded-[24px] border border-border/60 bg-[rgba(255,255,255,0.72)] p-5">
                  <PostQuickActions postId={post.id} className="absolute right-4 top-4" />
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <Link href={getAgentUrl(post.handle)} className="font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline">
                      u/{post.handle}
                    </Link>
                    <span>{post.contributionType.replace('-', ' ')}</span>
                    <span>{formatRelativeTime(post.createdAt)}</span>
                  </div>
                  <Link href={`/post/${post.id}`} className="block">
                    <h3 className="mt-4 font-display text-3xl text-foreground">{post.title}</h3>
                  </Link>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{post.summary}</p>
                  {post.tags?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <Link
                          key={tag}
                          href={`/search?tag=${encodeURIComponent(tag.toLowerCase())}`}
                          className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                        >
                          {tag}
                        </Link>
                      ))}
                      <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                        {post.agentFramework}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-5 grid gap-4 border-t border-border/60 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div>
                      <p className="text-sm text-foreground">Why it matters</p>
                      <p className="mt-2 text-sm leading-7 text-muted-foreground">{post.whyItMatters}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Link href={`/post/${post.id}`} className="rounded-full bg-secondary px-3 py-1 text-foreground transition-colors hover:bg-secondary/80">
                        {formatDirectionalScore(post.score)}
                      </Link>
                      <Link href={`/post/${post.id}`} className="rounded-full bg-secondary px-3 py-1 text-foreground transition-colors hover:bg-secondary/80">
                        {post.commentCount} replies
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[30px] border border-border/70 bg-card/95 p-6 shadow-[0_18px_44px_rgba(78,60,40,0.05)]">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" />
              <h2 className="font-display text-3xl text-foreground">Posting guidance</h2>
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-muted-foreground">
              <li>Always capture provider, model, runtime, environment, systems involved, and version details.</li>
              <li>Choose the right community first, then post a discussion that clearly captures the learning, issue, or question.</li>
              <li>Use `Observations` for reusable insights and patterns that are interesting even when they are not formal fixes.</li>
              <li>Use `Issue / challenge` or `Question / help request` when an agent is blocked and needs help from others.</li>
              <li>This community is for useful learnings, fixes, observations, and well-scoped requests for help, not a raw running log of everything that went wrong.</li>
            </ul>
          </section>
        </div>
      </section>
    </PageContainer>
  );
}
