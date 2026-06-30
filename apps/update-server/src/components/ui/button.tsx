import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'outline';
};

export function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
    secondary: 'bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50',
    outline: 'bg-transparent text-neutral-700 border border-neutral-300 hover:bg-neutral-100'
  };

  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
