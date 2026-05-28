export function StatusBanner({ kind, title, message }: { kind: 'error' | 'success'; title: string; message: string }) {
  return (
    <div className={`status ${kind}`}>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}
