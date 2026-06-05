type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
};

export function ChannelToggleCard({
  checked,
  onChange,
  disabled,
  label,
  description
}: SwitchProps) {
  return (
    <label
      className={`group flex items-start justify-between gap-4 rounded-xl border p-4 transition-all duration-200 select-none bg-[hsl(var(--canvas))] ${
        checked
          ? 'border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--surface-soft))] shadow-2xs'
          : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted-soft))] hover:bg-[hsl(var(--surface-soft))/0.2]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <div className="flex flex-1 flex-col gap-0.5 pr-2">
        <span
          className={`text-xs font-semibold text-[hsl(var(--body-strong))] transition-colors ${
            checked ? 'text-[hsl(var(--primary))]' : 'group-hover:text-[hsl(var(--primary))]'
          }`}
        >
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 text-[10px] leading-relaxed text-[hsl(var(--muted))]">{description}</span>
        ) : null}
      </div>
      <div
        onClick={(event) => {
          if (disabled) {
            return;
          }
          event.preventDefault();
          onChange(!checked);
        }}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] focus:ring-offset-2 ${
          checked ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-soft))/0.3]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
    </label>
  );
}
