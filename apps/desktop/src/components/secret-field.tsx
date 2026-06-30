import { useId, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { EyeIcon, EyeOffIcon, KeyIcon } from './icons';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  className?: string;
};

export function SecretField({ label, value, onChange, placeholder, description, className }: Props) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="text-xs font-semibold text-[hsl(var(--body-strong))]">
        {label}
      </label>
      <div className="relative">
        <KeyIcon
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted))]"
        />
        <Input
          id={inputId}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'secret-field-input pr-22 pl-9 font-mono tracking-[0.02em]',
            !visible && 'secret-field-input--masked'
          )}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-[hsl(var(--muted))] hover:text-[hsl(var(--ink))]"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? '隐藏激活码' : '查看激活码'}
          title={visible ? '隐藏激活码' : '查看激活码'}
        >
          {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </Button>
      </div>
      {description ? (
        <p className="text-[11px] text-[hsl(var(--muted-soft))]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
