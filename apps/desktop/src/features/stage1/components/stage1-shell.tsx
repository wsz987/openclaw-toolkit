import type { ReactNode } from 'react';
import { cn } from '../../../lib/utils';

type Stage1ShellProps = {
  sidebar: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  contentInnerClassName?: string;
};

export function Stage1Shell({
  sidebar,
  content,
  footer,
  contentClassName,
  contentInnerClassName
}: Stage1ShellProps) {
  return (
    <main className="app-shell flex h-screen w-screen overflow-hidden bg-[hsl(var(--canvas))] animate-fade-in">
      <aside className="w-80 border-r border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-8 flex flex-col justify-between h-full overflow-y-auto flex-shrink-0">
        <div className="flex flex-col gap-8">{sidebar}</div>
        <div className="flex flex-col gap-4 pt-4 border-t border-[hsl(var(--hairline))]">
          {footer}
        </div>
      </aside>

      <section className={cn('flex-1 flex flex-col min-h-0 bg-[hsl(var(--canvas))]', contentClassName)}>
        <div className={cn('max-w-[1000px] w-full mx-auto flex-1 flex flex-col min-h-0', contentInnerClassName)}>
          {content}
        </div>
      </section>
    </main>
  );
}
