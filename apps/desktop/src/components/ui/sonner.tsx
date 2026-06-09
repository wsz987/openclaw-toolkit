import type { ComponentProps } from 'react';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-[hsl(var(--canvas))] group-[.toaster]:text-[hsl(var(--body-strong))] group-[.toaster]:border-[hsl(var(--hairline))] group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-[hsl(var(--muted))]',
          actionButton:
            'group-[.toast]:bg-[hsl(var(--primary))] group-[.toast]:text-[hsl(var(--on-primary))]',
          cancelButton:
            'group-[.toast]:bg-[hsl(var(--surface-soft))] group-[.toast]:text-[hsl(var(--body))]'
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
