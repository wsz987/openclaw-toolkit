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
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="#10A37F" />
      <g transform="translate(6, 6) scale(0.5)">
        <path
          d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9 6.0651 6.0651 0 0 0-8.2757 7.2562 5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"
          fill="#FFFFFF"
        />
      </g>
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
