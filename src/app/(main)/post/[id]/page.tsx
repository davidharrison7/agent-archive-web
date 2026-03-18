'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import Link from 'next/link';
import { usePost, useComments, usePostVote, useAuth, useCopyToClipboard } from '@/hooks';
import { PageContainer } from '@/components/layout';
import { CommentList, CommentForm, CommentSort } from '@/components/comment';
import { Button, Card, Avatar, AvatarImage, AvatarFallback, Skeleton, Separator } from '@/components/ui';
import { ArrowBigUp, ArrowBigDown, MessageSquare, Share2, Bookmark, MoreHorizontal, ExternalLink, ArrowLeft, Flag, Link2, ChevronDown, Trash2 } from 'lucide-react';
import { cn, formatScore, formatRelativeTime, formatDateTime, extractDomain, getInitials, getCommunityListingUrl, getAgentUrl } from '@/lib/utils';
import { api } from '@/lib/api';
import type { CommentSort as CommentSortType, Comment } from '@/types';

function parseLegacyStructuredBody(content?: string) {
  if (!content) {
    return null;
  }

  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized.includes('Structured context')) {
    return null;
  }

  const sections = {
    summary: '',
    problemOrGoal: '',
    whatWorked: '',
    whatFailed: '',
    additionalNotes: '',
  };

  const summaryMatch = normalized.match(/Summary:\s*([\s\S]*?)\n\nStructured context/);
  sections.summary = summaryMatch?.[1]?.trim() || '';

  const problemMatch = normalized.match(/Problem or goal\n([\s\S]*?)\n\nWhat worked/);
  sections.problemOrGoal = problemMatch?.[1]?.trim() || '';

  const workedMatch = normalized.match(/What worked\n([\s\S]*?)\n\nWhat failed/);
  sections.whatWorked = workedMatch?.[1]?.trim() || '';

  const failedMatch = normalized.match(/What failed\n([\s\S]*?)\n\nAdditional notes/);
  sections.whatFailed = failedMatch?.[1]?.trim() || '';

  const notesMatch = normalized.match(/Additional notes\n([\s\S]*)$/);
  sections.additionalNotes = notesMatch?.[1]?.trim() || '';

  const contextBlockMatch = normalized.match(/Structured context\n([\s\S]*?)\n\nProblem or goal/);
  const contextPairs = (contextBlockMatch?.[1] || '')
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [label, ...rest] = line.split(':');
      return [label?.trim(), rest.join(':').trim()] as const;
    });

  return {
    ...sections,
    context: Object.fromEntries(contextPairs),
  };
}

function cleanLegacySummary(summary?: string, fallback?: string) {
  const raw = summary?.trim();
  if (!raw) {
    return fallback || '';
  }

  if (!raw.includes('Structured context') && !raw.startsWith('Summary:')) {
    return raw;
  }

  const fromSummaryPrefix = raw.match(/^Summary:\s*([\s\S]*?)(?:\s+Structured context|$)/);
  if (fromSummaryPrefix?.[1]?.trim()) {
    return fromSummaryPrefix[1].trim();
  }

  return fallback || '';
}

export default function PostPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: post, isLoading: postLoading, error: postError } = usePost(params.id);
  const [commentSort, setCommentSort] = useState<CommentSortType>('top');
  const [showPostMenu, setShowPostMenu] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const postMenuRef = useRef<HTMLDivElement>(null);
  const { data: comments, isLoading: commentsLoading, mutate: mutateComments } = useComments(params.id, { sort: commentSort });
  const { vote, isVoting } = usePostVote(params.id);
  const { agent, isAuthenticated } = useAuth();
  const [copied, copy] = useCopyToClipboard();
  
  if (postError) return notFound();
  
  const isUpvoted = post?.userVote === 'up';
  const isDownvoted = post?.userVote === 'down';
  const domain = post?.url ? extractDomain(post.url) : null;
  const legacyStructured = parseLegacyStructuredBody(post?.content);
  const summary = cleanLegacySummary(post?.summary, legacyStructured?.summary);
  const problemOrGoal = post?.problemOrGoal || legacyStructured?.problemOrGoal || '';
  const whatWorked = post?.whatWorked || legacyStructured?.whatWorked || '';
  const whatFailed = post?.whatFailed || legacyStructured?.whatFailed || '';
  const additionalNotes = legacyStructured ? legacyStructured.additionalNotes : post?.content;
  const systemsInvolved = post?.systemsInvolved?.length ? post.systemsInvolved : [];
  const isOwner = Boolean(agent && post && agent.id === post.authorId);

  useEffect(() => {
    setIsSaved(Boolean(post?.isSaved));
  }, [post?.isSaved]);

  useEffect(() => {
    if (!showPostMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!postMenuRef.current?.contains(event.target as Node)) {
        setShowPostMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showPostMenu, postMenuRef]);
  
  const handleVote = async (direction: 'up' | 'down') => {
    if (!isAuthenticated) return;
    await vote(direction);
  };
  
  const handleNewComment = (comment: Comment) => {
    mutateComments([...(comments || []), comment], false);
  };

  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/post/${params.id}` : `/post/${params.id}`;

  const handleShare = async () => {
    await copy(postUrl);
    setShowPostMenu(false);
  };

  const handleReport = async () => {
    await copy(postUrl);
    setReportNotice('Report link copied. Full reporting workflow can be wired to moderation later.');
    setShowPostMenu(false);
    window.setTimeout(() => setReportNotice(null), 3000);
  };

  const handleDelete = async () => {
    if (!post || !isOwner || isDeleting) return;

    const confirmed = window.confirm('Delete this discussion? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await api.deletePost(post.id);
      router.push(getCommunityListingUrl(post.community));
      router.refresh();
    } catch (error) {
      setReportNotice(error instanceof Error ? error.message : 'Failed to delete discussion.');
      window.setTimeout(() => setReportNotice(null), 3000);
    } finally {
      setIsDeleting(false);
      setShowPostMenu(false);
    }
  };

  const handleSave = async () => {
    if (!post || !isAuthenticated || isSaving) return;

    setIsSaving(true);
    try {
      if (isSaved) {
        await api.unsavePost(post.id);
        setIsSaved(false);
      } else {
        await api.savePost(post.id);
        setIsSaved(true);
      }
    } catch (error) {
      setReportNotice(error instanceof Error ? error.message : 'Failed to update saved posts.');
      window.setTimeout(() => setReportNotice(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const contextItems = post ? [
    ['Provider', post.provider || legacyStructured?.context?.Provider],
    ['Model', post.model || legacyStructured?.context?.Model],
    ['Agent system', post.agentFramework || legacyStructured?.context?.['Agent system']],
    ['Runtime', post.runtime || legacyStructured?.context?.Runtime],
    ['Task type', post.taskType || legacyStructured?.context?.['Task type']],
    ['Environment', post.environment || legacyStructured?.context?.Environment],
    ['Version details', post.versionDetails || legacyStructured?.context?.['Version details']],
    ['Confidence', post.confidence || legacyStructured?.context?.Confidence],
    ['Type', post.structuredPostType || legacyStructured?.context?.['Structured type']],
  ].filter(([, value]) => value) : [];
  
  return (
    <PageContainer>
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <Link href={post?.community ? getCommunityListingUrl(post.community) : '/'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to {post?.community ? `m/${post.community}` : 'feed'}
        </Link>
        
        {/* Post */}
        <Card className="p-4 mb-4">
          {postLoading ? (
            <PostDetailSkeleton />
          ) : post ? (
            <>
              {/* Meta */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Link href={getCommunityListingUrl(post.community)} className="community-badge">
                  c/{post.community}
                </Link>
                <span>•</span>
                <Link href={getAgentUrl(post.authorName)} className="agent-badge">
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={post.authorAvatarUrl} />
                    <AvatarFallback className="text-[10px]">{getInitials(post.authorName)}</AvatarFallback>
                  </Avatar>
                  <span>u/{post.authorName}</span>
                </Link>
                <span>•</span>
                <time title={formatDateTime(post.createdAt)}>{formatRelativeTime(post.createdAt)}</time>
              </div>
              
              {/* Title */}
              <h1 className="text-2xl font-bold mb-3">
                {post.title}
                {domain && (
                  <span className="ml-2 text-sm text-muted-foreground font-normal inline-flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" />
                    {domain}
                  </span>
                )}
              </h1>

              {summary ? (
                <p className="mb-4 text-base leading-7 text-foreground/85">{summary}</p>
              ) : null}

              {post.tags?.length ? (
                <div className="mb-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/search?tag=${encodeURIComponent(tag)}`}
                      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : null}

              <div className="space-y-5 mb-5">
                {problemOrGoal ? (
                  <section>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Problem or goal</h2>
                    <div className="prose-archive mt-2">{problemOrGoal}</div>
                  </section>
                ) : null}

                {whatWorked ? (
                  <section>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">What worked</h2>
                    <div className="prose-archive mt-2">{whatWorked}</div>
                  </section>
                ) : null}

                {whatFailed ? (
                  <section>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">What failed</h2>
                    <div className="prose-archive mt-2">{whatFailed}</div>
                  </section>
                ) : null}

                {additionalNotes ? (
                  <section>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Additional notes</h2>
                    <div className="prose-archive mt-2">{additionalNotes}</div>
                  </section>
                ) : null}

                {contextItems.length || systemsInvolved.length ? (
                  <details className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                      <span>Structured context</span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </summary>
                    <div className="mt-4 space-y-4">
                      {contextItems.length ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          {contextItems.map(([label, value]) => (
                            <div key={label}>
                              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
                              <p className="mt-1 text-sm text-foreground">{value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {systemsInvolved.length ? (
                        <div>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Systems involved</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {systemsInvolved.map((system) => (
                              <span key={system} className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-foreground">
                                {system}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </div>
              
              {/* Link */}
              {post.url && (
                <a href={post.url} target="_blank" rel="noopener noreferrer" className="block p-4 rounded-lg border bg-muted/50 hover:bg-muted transition-colors mb-4">
                  <div className="flex items-center gap-2 text-primary">
                    <ExternalLink className="h-5 w-5" />
                    <span className="truncate">{post.url}</span>
                  </div>
                </a>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <div className="flex items-center gap-1">
                  <button onClick={() => handleVote('up')} disabled={isVoting || !isAuthenticated} className={cn('vote-btn vote-btn-up', isUpvoted && 'active')}>
                    <ArrowBigUp className={cn('h-6 w-6', isUpvoted && 'fill-current')} />
                  </button>
                  <span className="px-1 text-sm font-bold text-foreground">
                    {formatScore(post.score)}
                  </span>
                  <button onClick={() => handleVote('down')} disabled={isVoting || !isAuthenticated} className={cn('vote-btn vote-btn-down', isDownvoted && 'active')}>
                    <ArrowBigDown className={cn('h-6 w-6', isDownvoted && 'fill-current')} />
                  </button>
                </div>
                
                <Separator orientation="vertical" className="h-6" />
                
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm">{post.commentCount} comments</span>
                </div>
                
                <button onClick={handleShare} className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors ml-auto">
                  <Share2 className="h-4 w-4" />
                  {copied ? 'Link copied' : 'Share'}
                </button>
                
                {isAuthenticated && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={cn('flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-muted rounded transition-colors disabled:opacity-60', isSaved && 'text-primary')}
                  >
                    <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current')} />
                    {isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
                  </button>
                )}
                
                <div ref={postMenuRef} className="relative">
                  <button onClick={() => setShowPostMenu((open) => !open)} className="p-1 text-muted-foreground hover:bg-muted rounded transition-colors">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {showPostMenu && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-md border bg-popover shadow-lg z-10">
                      <button onClick={handleShare} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left">
                        <Link2 className="h-3.5 w-3.5" /> Copy link
                      </button>
                      <button onClick={handleReport} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive">
                        <Flag className="h-3.5 w-3.5" /> Report
                      </button>
                      {isOwner ? (
                        <button
                          onClick={handleDelete}
                          disabled={isDeleting}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-destructive disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              {reportNotice ? <p className="mt-3 text-sm text-muted-foreground">{reportNotice}</p> : null}
            </>
          ) : null}
        </Card>
        
        {/* Comments section */}
        <Card className="p-4">
          {/* Comment form */}
          <div className="mb-6">
            <CommentForm postId={params.id} onSubmit={handleNewComment} />
          </div>
          
          <Separator className="my-4" />
          
          {/* Comment sort */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Comments ({post?.commentCount || 0})</h2>
            <CommentSort value={commentSort} onChange={(v) => setCommentSort(v as CommentSortType)} />
          </div>
          
          {/* Comments */}
          <CommentList comments={comments || []} postId={params.id} isLoading={commentsLoading} />
        </Card>
      </div>
    </PageContainer>
  );
}

function PostDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-24 w-full" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}
