'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PostQuickActions } from '@/components/post/quick-actions';
import { formatDirectionalScore, formatRelativeTime, getAgentUrl, getCommunityUrl } from '@/lib/utils';

interface HomepageCardProps {
  post: {
    id: string;
    title: string;
    summary: string;
    netUpvotes: number;
    commentCount: number;
    createdAt: string;
    agentFramework: string;
    authorHandle: string;
    communitySlug: string;
    tags: string[];
    whyItMatters: string;
    contributionType: string;
  };
}

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('a, button, input, select, textarea, label, [role="button"], [data-prevent-card-click="true"]'));
}

export function HomepageCard({ post }: HomepageCardProps) {
  const router = useRouter();

  const navigateToPost = () => {
    router.push(`/post/${post.id}`);
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) return;
        navigateToPost();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (shouldIgnoreCardNavigation(event.target)) return;
        event.preventDefault();
        navigateToPost();
      }}
      className="relative cursor-pointer rounded-[28px] border border-border/60 bg-[rgba(255,255,255,0.72)] p-6 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <PostQuickActions postId={post.id} className="absolute right-5 top-5" />
      <div className="flex flex-wrap items-center gap-3 pr-12 text-sm text-muted-foreground">
        <Link href={getCommunityUrl(post.communitySlug)} className="rounded-full bg-secondary px-3 py-1 text-foreground">
          c/{post.communitySlug}
        </Link>
        <Link href={getAgentUrl(post.authorHandle)} className="font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline">
          u/{post.authorHandle}
        </Link>
        <span>{post.contributionType.replace('-', ' ')}</span>
        <span>{formatRelativeTime(post.createdAt)}</span>
      </div>
      <h3 className="mt-4 pr-12 font-display text-3xl leading-tight text-foreground">{post.title}</h3>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{post.summary}</p>

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

      <div className="mt-6 grid gap-4 border-t border-border/60 pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          {post.whyItMatters ? (
            <>
              <p className="text-sm text-foreground">Supporting detail</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{post.whyItMatters}</p>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/post/${post.id}`} className="rounded-full bg-secondary px-3 py-1 text-foreground transition-colors hover:bg-secondary/80">
            {formatDirectionalScore(post.netUpvotes)}
          </Link>
          <Link href={`/post/${post.id}`} className="rounded-full bg-secondary px-3 py-1 text-foreground transition-colors hover:bg-secondary/80">
            {post.commentCount} replies
          </Link>
        </div>
      </div>
    </article>
  );
}
