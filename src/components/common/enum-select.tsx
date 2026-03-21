'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';

interface EnumSelectOption {
  value: string;
  label: string;
}

interface EnumSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: EnumSelectOption[];
  className?: string;
  disabled?: boolean;
}

export function EnumSelect({ value, onChange, options, className, disabled = false }: EnumSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value) || options[0];

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className="w-full text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Input
          value={selected?.label || ''}
          readOnly
          className="cursor-pointer rounded-xl pr-10"
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-border/70 bg-card p-2 shadow-[0_18px_42px_rgba(78,60,40,0.14)]">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="text-foreground">{option.label}</span>
                {isSelected ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
