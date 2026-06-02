import Ansi from 'ansi-to-react';

type AnsiLogLineProps = {
  line: string;
  stripTimestamp?: boolean;
  className?: string;
};

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/;
const ANSI_ESCAPE_GLOBAL_PATTERN = /\u001b\[[0-9;]*m/g;
const TIMESTAMP_PREFIX_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\s+/;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function inferTone(text: string) {
  const lowered = text.toLowerCase();

  if (lowered.includes('error') || lowered.includes('failed')) {
    return 'text-[hsl(var(--error))]';
  }

  if (lowered.includes('warn')) {
    return 'text-[hsl(var(--warning))]';
  }

  if (lowered.includes('完成') || lowered.includes('success') || lowered.includes('added ')) {
    return 'text-[hsl(var(--success))]';
  }

  return 'text-[hsl(var(--on-dark-soft))]';
}

export function AnsiLogLine({ line, stripTimestamp = false, className }: AnsiLogLineProps) {
  const displayLine = stripTimestamp ? line.replace(TIMESTAMP_PREFIX_PATTERN, '') : line;
  const plainText = displayLine.replace(ANSI_ESCAPE_GLOBAL_PATTERN, '');
  const hasAnsi = ANSI_ESCAPE_PATTERN.test(displayLine);
  const tone = inferTone(plainText);

  if (!hasAnsi) {
    return <div className={cx('font-mono text-[11px] leading-5 whitespace-pre-wrap break-all', tone, className)}>{plainText}</div>;
  }

  return (
    <div className={cx('font-mono text-[11px] leading-5 whitespace-pre-wrap break-all text-[hsl(var(--on-dark))]', className)}>
      <Ansi>{displayLine}</Ansi>
    </div>
  );
}
