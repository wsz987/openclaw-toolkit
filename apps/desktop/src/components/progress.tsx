type Props = {
  value: number;
};

export function Progress({ value }: Props) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className="progress-root" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <div className="progress-indicator" style={{ width: `${clamped}%` }} />
    </div>
  );
}
