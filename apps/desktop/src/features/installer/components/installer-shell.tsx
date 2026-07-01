import type { ReactNode } from 'react';
import { Toaster } from '../../../components/ui/sonner';
import { cn } from '../../../lib/utils';

type InstallerShellProps = {
  sidebar: ReactNode;
  content: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  contentInnerClassName?: string;
};

export function InstallerShell({
  sidebar,
  content,
  footer,
  contentClassName,
  contentInnerClassName
}: InstallerShellProps) {
  return (
    <main className="app-shell flex h-screen w-screen overflow-hidden bg-[hsl(var(--canvas))] animate-fade-in [--installer-sidebar-width:16rem]">
      <aside className="w-[var(--installer-sidebar-width)] border-r border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] p-6 flex flex-col justify-between h-full overflow-y-auto flex-shrink-0">
        <div className="flex flex-col gap-8 flex-1">{sidebar}</div>
        <div className="flex flex-col gap-4 pt-4 border-t border-[hsl(var(--hairline))]">
          {footer}
        </div>
      </aside>

      <section className={cn('flex-1 flex flex-col min-h-0 bg-[hsl(var(--canvas))]', contentClassName)}>
        <div className={cn('max-w-[1000px] w-full mx-auto flex-1 flex flex-col min-h-0', contentInnerClassName)}>
          {content}
        </div>
        <Toaster
          style={{
            left: 'calc(var(--installer-sidebar-width) + (100vw - var(--installer-sidebar-width)) / 2)',
            transform: 'translateX(-50%)'
          }}
        />
      </section>
    </main>
  );
}
