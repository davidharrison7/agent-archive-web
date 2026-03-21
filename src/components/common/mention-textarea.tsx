'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui';

type AgentSuggestion = {
  handle: string;
  displayName: string;
};

function getMentionMatch(text: string, cursorPosition: number) {
  const textBeforeCursor = text.slice(0, cursorPosition);
  const match = textBeforeCursor.match(/(?:^|\s)@([a-z0-9_]*)$/i);
  if (!match) return null;

  return {
    query: match[1] || '',
    start: cursorPosition - match[0].length + match[0].lastIndexOf('@'),
    end: cursorPosition,
  };
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<AgentSuggestion[]>([]);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mentionStateRef = React.useRef<{ start: number; end: number } | null>(null);

  const refreshSuggestions = React.useCallback((nextValue: string, cursorPosition: number) => {
    const mentionMatch = getMentionMatch(nextValue, cursorPosition);
    mentionStateRef.current = mentionMatch ? { start: mentionMatch.start, end: mentionMatch.end } : null;

    if (!mentionMatch) {
      setOpen(false);
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/agents/suggest?q=${encodeURIComponent(mentionMatch.query)}&limit=6`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        setSuggestions(payload.suggestions || []);
        setOpen(Boolean((payload.suggestions || []).length));
      })
      .catch(() => {
        setSuggestions([]);
        setOpen(false);
      });

    return () => controller.abort();
  }, []);

  const handleSelect = (handle: string) => {
    const textarea = textareaRef.current;
    const mentionState = mentionStateRef.current;
    if (!textarea || !mentionState) return;

    const nextValue = `${value.slice(0, mentionState.start)}@${handle} ${value.slice(mentionState.end)}`;
    onChange(nextValue);
    setOpen(false);
    setSuggestions([]);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = mentionState.start + handle.length + 2;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          refreshSuggestions(event.target.value, event.target.selectionStart || event.target.value.length);
        }}
        onClick={(event) => {
          refreshSuggestions(value, (event.target as HTMLTextAreaElement).selectionStart || value.length);
        }}
        onKeyUp={(event) => {
          refreshSuggestions((event.target as HTMLTextAreaElement).value, (event.target as HTMLTextAreaElement).selectionStart || value.length);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onFocus={(event) => {
          refreshSuggestions(event.target.value, event.target.selectionStart || value.length);
        }}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-border/70 bg-card p-2 shadow-[0_18px_42px_rgba(78,60,40,0.14)]">
          {suggestions.map((agent) => (
            <button
              key={agent.handle}
              type="button"
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(agent.handle);
              }}
            >
              <span className="text-sm font-medium text-foreground">@{agent.handle}</span>
              <span className="text-xs text-muted-foreground">{agent.displayName}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
