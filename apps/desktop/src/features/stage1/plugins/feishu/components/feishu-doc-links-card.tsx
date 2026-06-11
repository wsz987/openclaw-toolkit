import { ArrowRight, BookOpen, ExternalLink, LifeBuoy, Shield } from 'lucide-react';
import { Button } from '../../../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card';
import {
  FEISHU_PERMISSION_TROUBLESHOOTING,
  FEISHU_PLUGIN_GUIDE_URL,
  FEISHU_PLUGIN_VERIFICATION_ITEMS,
  getFeishuConsoleLinks
} from '../model/feishu-docs';

type FeishuDocLinksCardProps = {
  appId: string;
  domain: 'feishu' | 'lark';
  onOpenUrl: (url: string) => Promise<unknown> | unknown;
  onOpenFaq: () => void;
  onOpenQr: () => void;
};

export function FeishuDocLinksCard({
  appId,
  domain,
  onOpenUrl,
  onOpenFaq,
  onOpenQr
}: FeishuDocLinksCardProps) {
  const links = getFeishuConsoleLinks(appId, domain);

  return (
    <Card className="border-dashed border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))]">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-5 pb-1">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
            飞书接入校验与环境要求
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            文档、控制台配置入口和插件扫码授权都集中在这里，便于用户边配置边核对。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" className="h-8 px-3 text-[11px]" onClick={() => void onOpenUrl(FEISHU_PLUGIN_GUIDE_URL)}>
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            打开安装指南
          </Button>
          <Button variant="secondary" className="h-8 px-3 text-[11px]" onClick={onOpenFaq}>
            <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
            常见权限问题
          </Button>
          <Button className="h-8 px-3 text-[11px]" onClick={onOpenQr}>
            插件授权二维码
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-5">
        {FEISHU_PLUGIN_VERIFICATION_ITEMS.map((item) => {
          const consoleUrl =
            item.id === 'credentials'
              ? links.credentials
              : item.id === 'bot'
                ? links.bot
                : item.id === 'event'
                  ? links.eventSubscription
                  : links.permissions;

          return (
            <div
              key={item.id}
              className="rounded-xl border border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))]"
            >
              <div className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--primary))]" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[hsl(var(--body-strong))]">{item.title}</div>
                  <div className="mt-1">{item.description}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px]"
                      onClick={() => void onOpenUrl(consoleUrl)}
                    >
                      <ExternalLink className="mr-1.5 h-3 w-3" />
                      {item.consoleHint}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px]"
                      onClick={() => void onOpenUrl(links.docs)}
                    >
                      <BookOpen className="mr-1.5 h-3 w-3" />
                      {item.docLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.04)] px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))]">
          <strong className="block text-[hsl(var(--body-strong))]">{FEISHU_PERMISSION_TROUBLESHOOTING.title}</strong>
          <div className="mt-1">
            建议在权限报错后先补开 scope，再重新生成授权二维码完成增量授权，避免用户反复卡在同一个报错里。
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
