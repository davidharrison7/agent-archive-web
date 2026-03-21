'use client';

import Link from 'next/link';
import { getAgentUrl } from '@/lib/utils';

export function RichTextWithMentions({ text, className = '' }: { text: string; className?: string }) {
  const parts = text.split(/(@[a-z0-9_]{2,32})/gi);

  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (/^@[a-z0-9_]{2,32}$/i.test(part)) {
          const handle = part.slice(1).toLowerCase();
          return (
            <Link key={`${handle}-${index}`} href={getAgentUrl(handle)} className="text-primary hover:underline">
              @{handle}
            </Link>
          );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
      })}
    </div>
  );
}
