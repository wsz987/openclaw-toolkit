import { BookOpen, ExternalLink, HelpCircle } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { getQqbotConsoleLinks } from '../model/qqbot-docs';

type QqbotDocLinksCardProps = {
  appId?: string | null;
  onOpenUrl: (url: string) => void;
  onOpenFaq: () => void;
};

export function QqbotDocLinksCard({ appId, onOpenUrl, onOpenFaq }: QqbotDocLinksCardProps) {
  const links = getQqbotConsoleLinks(appId);

  return (
    <div className="rounded-2xl border border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))/0.35] p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--body-strong))]">
        <BookOpen className="h-4 w-4 text-[hsl(var(--primary))]" />
        官方文档与控制台
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-[hsl(var(--muted))]">
        首次接入需要在 QQ 开放平台创建机器人、复制 AppID / AppSecret，并根据需要配置沙箱、IP 白名单或 Webhook 回调。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="h-8 text-[11px]" onClick={() => onOpenUrl(links.openPlatformHome)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          QQ 开放平台
        </Button>
        <Button type="button" variant="secondary" className="h-8 text-[11px]" onClick={() => onOpenUrl(links.officialDocs)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          QQ Bot 官方文档
        </Button>
        <Button type="button" variant="secondary" className="h-8 text-[11px]" onClick={() => onOpenUrl(links.docs)}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          插件仓库
        </Button>
        <Button type="button" variant="ghost" className="h-8 text-[11px]" onClick={onOpenFaq}>
          <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
          排查清单
        </Button>
      </div>
    </div>
  );
}
