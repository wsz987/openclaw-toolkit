export function BrandSpike({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', transform: 'rotate(15deg)' }}
    >
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 2c-.4 0-.7.3-.7.7v5c0 .4.3.7.7.7s.7-.3.7-.7V2.7c0-.4-.3-.7-.7-.7zM12 15.6c-.4 0-.7.3-.7.7v5c0 .4.3.7.7.7s.7-.3.7-.7v-5c0-.4-.3-.7-.7-.7zM2 12c0-.4.3-.7.7-.7h5c.4 0 .7.3.7.7s-.3.7-.7.7H2.7c-.4 0-.7-.3-.7-.7zM15.6 12c0-.4.3-.7.7-.7h5c.4 0 .7.3.7.7s-.3.7-.7.7h-5c-.4 0-.7-.3-.7-.7zM4.9 4.9c-.3-.3-.7-.3-1 0s-.3.7 0 1l3.5 3.5c.3.3.7.3 1 0s.3-.7 0-1L4.9 4.9zm10.6 10.6c-.3-.3-.7-.3-1 0s-.3.7 0 1l3.5 3.5c.3.3.7.3 1 0s.3-.7 0-1l-3.5-3.5zM19.1 4.9c.3-.3.3-.7 0-1s-.7-.3-1 0l-3.5 3.5c-.3.3-.3.7 0 1s.7.3 1 0l3.5-3.5zM8.5 15.5c.3-.3.3-.7 0-1s-.7-.3-1 0l-3.5 3.5c-.3.3-.3.7 0 1s.7.3 1 0l3.5-3.5z" />
    </svg>
  );
}
