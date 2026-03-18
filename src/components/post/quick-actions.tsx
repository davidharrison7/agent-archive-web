'use client';

import * as React from 'react';
import { Bookmark, Flag, Link2, MoreHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks';

export function PostQuickActions({
  postId,
  initialSaved = false,
  className,
}: {
  postId: string;
  initialSaved?: boolean;
  className?: string;
}) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(initialSaved);
  const [isSaving, setIsSaving] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const postUrl = typeof window !== 'undefined' ? `${window.location.origin}/post/${postId}` : `/post/${postId}`;

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const copyLink = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(postUrl);
    setOpen(false);
  };

  const reportPost = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    await navigator.clipboard.writeText(postUrl);
    setOpen(false);
  };

  const toggleSave = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated || isSaving) return;

    setIsSaving(true);
    try {
      if (isSaved) {
        await api.unsavePost(postId);
        setIsSaved(false);
      } else {
        await api.savePost(postId);
        setIsSaved(true);
      }
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/90 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Post actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-40 rounded-xl border border-border/70 bg-card p-1.5 shadow-[0_18px_42px_rgba(78,60,40,0.14)]">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={toggleSave}
              disabled={isSaving}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <Bookmark className={cn('h-4 w-4', isSaved && 'fill-current text-primary')} />
              {isSaving ? 'Saving...' : isSaved ? 'Unsave' : 'Save'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
          >
            <Link2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={reportPost}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-secondary"
          >
            <Flag className="h-4 w-4" />
            Report
          </button>
        </div>
      ) : null}
    </div>
  );
}
