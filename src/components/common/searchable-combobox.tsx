'use client';

import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

export type SearchableComboboxOption = {
  value: string;
  label?: string;
  description?: string;
};

export type SuggestionFacet =
  | 'providers'
  | 'models'
  | 'agentFrameworks'
  | 'runtimes'
  | 'taskTypes'
  | 'environments'
  | 'tags'
  | 'communities';

export function SearchableCombobox({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
  error,
  emptyCreateLabel,
  suggestionFacet,
  helperText,
  allowCustom = true,
  className,
  selectionMode = 'display',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions: SearchableComboboxOption[];
  error?: string;
  emptyCreateLabel?: string;
  suggestionFacet?: SuggestionFacet;
  helperText?: string;
  allowCustom?: boolean;
  className?: string;
  selectionMode?: 'display' | 'value';
}) {
  const [open, setOpen] = React.useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = React.useState<SearchableComboboxOption[]>([]);
  const normalizedValue = value.trim().toLowerCase();
  const filteredSuggestions = React.useMemo(() => {
    const source = remoteSuggestions.length ? remoteSuggestions : suggestions;
    if (!normalizedValue) return source.slice(0, 8);
    return source
      .filter((suggestion) => `${suggestion.label || suggestion.value} ${suggestion.description || ''}`.toLowerCase().includes(normalizedValue))
      .slice(0, 8);
  }, [normalizedValue, remoteSuggestions, suggestions]);

  React.useEffect(() => {
    if (!suggestionFacet) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({
        facet: suggestionFacet,
        q: value,
        limit: '8',
      });

      fetch(`/api/facets?${params.toString()}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload) => {
          const mapped = (payload.suggestions || []).map((entry: string | { slug?: string; name?: string }) => {
            if (typeof entry === 'string') return { value: entry };
            return {
              value: entry.slug || entry.name || '',
              label: entry.name || entry.slug || '',
            };
          });
          setRemoteSuggestions(mapped.filter((entry: SearchableComboboxOption) => entry.value));
        })
        .catch(() => setRemoteSuggestions([]));
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [suggestionFacet, value]);

  const hasExactMatch = suggestions.some((suggestion) => {
    const display = suggestion.label || suggestion.value;
    return display.toLowerCase() === normalizedValue || suggestion.value.toLowerCase() === normalizedValue;
  }) || remoteSuggestions.some((suggestion) => {
    const display = suggestion.label || suggestion.value;
    return display.toLowerCase() === normalizedValue || suggestion.value.toLowerCase() === normalizedValue;
  });

  return (
    <div className={cn('space-y-2', className)}>
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      <div className="relative">
        <Input
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder={placeholder}
        />
        {open ? (
          <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-border/70 bg-card p-2 shadow-[0_18px_42px_rgba(78,60,40,0.14)]">
            {filteredSuggestions.map((suggestion) => {
              const display = suggestion.label || suggestion.value;
              const selected = display.toLowerCase() === normalizedValue || suggestion.value.toLowerCase() === normalizedValue;
              return (
                <button
                  key={`${suggestion.value}-${display}`}
                  type="button"
                  className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-secondary"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(selectionMode === 'value' ? suggestion.value : display);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{display}</span>
                    {suggestion.description ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.description}</span>
                    ) : null}
                  </span>
                  {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
            {allowCustom && !hasExactMatch && normalizedValue ? (
              <button
                type="button"
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(value.trim());
                  setOpen(false);
                }}
              >
                <Plus className="h-4 w-4 text-primary" />
                {emptyCreateLabel || `Use "${value.trim()}"`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
