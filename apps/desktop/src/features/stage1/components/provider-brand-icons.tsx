import type { SVGProps } from 'react';

type ProviderBrandIconProps = SVGProps<SVGSVGElement> & {
  providerId: string;
};

function VolcengineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="volcengine-gradient" x1="6" y1="4" x2="18" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8A00" />
          <stop offset="1" stopColor="#FF4D00" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5L5 9.5l3.1.2L12 5.8l3.9 3.9 3.1-.2L12 2.5Z"
        fill="url(#volcengine-gradient)"
      />
      <path
        d="M8.2 11.1 12 21.5l3.8-10.4-2.2.2L12 16.6l-1.6-5.3-2.2-.2Z"
        fill="url(#volcengine-gradient)"
      />
    </svg>
  );
}

function QwenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12 7.3 3.5 12 3.5Z"
        fill="#5B5BD6"
        opacity="0.12"
      />
      <path
        d="M12 5.5a6.5 6.5 0 1 0 4.96 10.7l-1.62-1.17A4.5 4.5 0 1 1 16.5 12h-3.25l2.9 4.75 2.9-4.75H18.5A6.5 6.5 0 0 0 12 5.5Z"
        fill="#5B5BD6"
      />
    </svg>
  );
}

function DeepSeekIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4 12c0-4.42 3.58-8 8-8 2.87 0 5.4 1.51 6.81 3.78-.66-.3-1.39-.47-2.16-.47-2.93 0-5.3 2.37-5.3 5.3 0 2.92 2.37 5.29 5.3 5.29.77 0 1.5-.16 2.16-.46A7.98 7.98 0 0 1 12 20c-4.42 0-8-3.58-8-8Z"
        fill="#3B82F6"
      />
      <path
        d="M14.25 10.2c1.82 0 3.3 1.48 3.3 3.3 0 1.81-1.48 3.29-3.3 3.29-1.81 0-3.29-1.48-3.29-3.29 0-1.82 1.48-3.3 3.29-3.3Z"
        fill="#60A5FA"
      />
      <path d="M8.2 9.3h3.1v1.7H8.2v-1.7Zm0 3.7h2.2v1.7H8.2V13Z" fill="#DBEAFE" />
    </svg>
  );
}

function MoonshotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 3a9 9 0 1 0 9 9c0-.36-.02-.72-.07-1.07A7 7 0 1 1 13.07 3.07C12.72 3.02 12.36 3 12 3Z"
        fill="#111827"
      />
      <path
        d="m15.4 5.2.76 2.08 2.09.76-2.09.76-.76 2.08-.76-2.08-2.08-.76 2.08-.76.76-2.08Z"
        fill="#3B82F6"
      />
    </svg>
  );
}

function ZhipuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="#0F172A" />
      <path d="M8 8h8l-8 8h8" stroke="#F8FAFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OpenAIIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="#111827" />
      <path
        d="M8.2 12a3.8 3.8 0 1 1 7.6 0 3.8 3.8 0 0 1-7.6 0Zm1.9 0a1.9 1.9 0 1 0 3.8 0 1.9 1.9 0 0 0-3.8 0Z"
        fill="#F8FAFC"
      />
      <path
        d="M16.55 15.7 14.7 9.1h1.63l.28 1.12h1.92l.28-1.12h1.63l-1.86 6.6h-2.03Zm1-2.56h1.15l-.57-2.3-.58 2.3Z"
        fill="#F8FAFC"
      />
    </svg>
  );
}

function XiaomiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="#FF6900" />
      <path
        d="M7.6 15.7V9.1h6.1c1.72 0 2.7.98 2.7 2.7v3.9h-1.75v-3.82c0-.82-.4-1.22-1.22-1.22h-.68v5.04H11V10.66H9.35v5.04H7.6Z"
        fill="#fff"
      />
      <path d="M17.2 9.1h1.75v6.6H17.2V9.1Z" fill="#fff" />
    </svg>
  );
}

function MiniMaxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="4" fill="#0E7490" />
      <path d="M7.5 16V8l4.5 4.55L16.5 8v8h-1.75v-3.88L12 14.9l-2.75-2.78V16H7.5Z" fill="#ECFEFF" />
    </svg>
  );
}

function DefaultProviderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="5" fill="#E2E8F0" />
      <path d="M8.5 12h7M12 8.5v7" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function normalizeProviderKey(providerId: string) {
  if (providerId.includes('volcengine') || providerId.includes('ark')) {
    return 'volcengine';
  }
  if (providerId.includes('qwen') || providerId.includes('dashscope')) {
    return 'qwen';
  }
  if (providerId.includes('deepseek')) {
    return 'deepseek';
  }
  if (providerId.includes('moonshot') || providerId.includes('kimi')) {
    return 'moonshot';
  }
  if (providerId.includes('zhipu') || providerId.includes('glm') || providerId.includes('bigmodel')) {
    return 'zhipu';
  }
  if (providerId.includes('openai')) {
    return 'openai';
  }
  if (providerId.includes('xiaomi') || providerId.includes('mimo')) {
    return 'xiaomi';
  }
  if (providerId.includes('minimax')) {
    return 'minimax';
  }
  return 'default';
}

export function ProviderBrandIcon({ providerId, ...props }: ProviderBrandIconProps) {
  const key = normalizeProviderKey(providerId.toLowerCase());

  switch (key) {
    case 'volcengine':
      return <VolcengineIcon {...props} />;
    case 'qwen':
      return <QwenIcon {...props} />;
    case 'deepseek':
      return <DeepSeekIcon {...props} />;
    case 'moonshot':
      return <MoonshotIcon {...props} />;
    case 'zhipu':
      return <ZhipuIcon {...props} />;
    case 'openai':
      return <OpenAIIcon {...props} />;
    case 'xiaomi':
      return <XiaomiIcon {...props} />;
    case 'minimax':
      return <MiniMaxIcon {...props} />;
    default:
      return <DefaultProviderIcon {...props} />;
  }
}
