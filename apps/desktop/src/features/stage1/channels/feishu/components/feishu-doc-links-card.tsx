import { useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  LifeBuoy,
  Shield,
  Check
} from 'lucide-react';
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
  activeStep?: 'credentials' | 'bot' | 'event' | 'release' | null;
  onOpenUrl: (url: string) => Promise<unknown> | unknown;
  onOpenFaq: () => void;
};

export function FeishuDocLinksCard({
  appId,
  domain,
  activeStep,
  onOpenUrl,
  onOpenFaq
}: FeishuDocLinksCardProps) {
  const links = getFeishuConsoleLinks(appId, domain);

  // Manual checklist states (persisted in local state)
  const [manualChecked, setManualChecked] = useState<Record<string, boolean>>({
    bot: false,
    event: false,
    release: false
  });

  // Auto-detect credentials status
  const isCredentialsAutoCompleted = appId.trim().startsWith('cli_') && appId.trim().length > 6;

  const getStepStatus = (id: string) => {
    if (id === 'credentials') {
      return isCredentialsAutoCompleted ? 'success' : 'pending';
    }
    return manualChecked[id] ? 'success' : 'pending';
  };

  const toggleStep = (id: string) => {
    if (id === 'credentials') return; // Read-only auto completed
    setManualChecked((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <Card className="border-dashed border-[hsl(var(--hairline))] bg-[hsl(var(--surface-soft))] transition-all duration-300">
      <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4 p-5 pb-1">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--body-strong))]">
            <Shield className="h-4 w-4 text-[hsl(var(--primary))]" />
            飞书接入校验与环境要求
          </CardTitle>
          <p className="text-[11px] leading-relaxed text-[hsl(var(--muted))]">
            文档、控制台配置入口和接入核对项都集中在这里，便于您边配置边核对。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
          <Button
            variant="secondary"
            className="h-8 px-3 text-[11px] font-medium"
            onClick={() => void onOpenUrl(FEISHU_PLUGIN_GUIDE_URL)}
          >
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            安装指南
          </Button>
          <Button
            variant="secondary"
            className="h-8 px-3 text-[11px] font-medium"
            onClick={onOpenFaq}
          >
            <LifeBuoy className="mr-1.5 h-3.5 w-3.5" />
            常见问题
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-5">
        {/* Setup Verification Checklist Items */}
        {FEISHU_PLUGIN_VERIFICATION_ITEMS.map((item) => {
          const consoleUrl =
            item.id === 'credentials'
              ? links.credentials
              : item.id === 'bot'
                ? links.bot
                : item.id === 'event'
                  ? links.eventSubscription
                  : links.permissions;

          const stepStatus = getStepStatus(item.id);
          const isFocused = activeStep === item.id;

          return (
            <div
              key={item.id}
              onClick={() => toggleStep(item.id)}
              className={`group transition-all duration-300 rounded-xl border px-4 py-3 text-[11px] leading-relaxed text-[hsl(var(--body))] cursor-pointer ${isFocused
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.03)] shadow-[0_0_12px_rgba(59,130,246,0.08)] scale-[1.005]'
                : 'border-[hsl(var(--hairline))] bg-[hsl(var(--canvas))] hover:border-[hsl(var(--muted-soft))]'
                }`}
            >
              <div className="flex items-start gap-3">
                {/* Step status checkbox indicator */}
                <div
                  className="mt-0.5 shrink-0 transition-transform duration-200 group-hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStep(item.id);
                  }}
                >
                  {stepStatus === 'success' ? (
                    <div className="w-4 h-4 rounded-full bg-[hsl(var(--success)/0.15)] border border-[hsl(var(--success)/0.3)] flex items-center justify-center text-[hsl(var(--success))]">
                      <Check className="w-3 h-3 stroke-[3px]" />
                    </div>
                  ) : (
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${isFocused ? 'border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.05)]' : 'border-[hsl(var(--hairline))] hover:border-[hsl(var(--muted))]'
                      }`}>
                      <span className="text-[9px] text-[hsl(var(--muted))] font-bold">{
                        item.id === 'credentials' ? '1' : item.id === 'bot' ? '2' : item.id === 'event' ? '3' : '4'
                      }</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold transition-colors ${isFocused ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--body-strong))]'
                      }`}>
                      {item.title}
                    </span>
                    {item.id === 'credentials' && isCredentialsAutoCompleted && (
                      <span className="text-[9px] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] px-1.5 py-0.5 rounded font-medium animate-fade-in shrink-0">
                        自动识别已填
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[hsl(var(--muted))]">{item.description}</div>
                  <div className="mt-2.5 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))]"
                      onClick={() => void onOpenUrl(consoleUrl)}
                    >
                      <ExternalLink className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
                      {item.consoleHint}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-7 px-2.5 text-[10px] font-medium border-[hsl(var(--hairline))]"
                      onClick={() => void onOpenUrl(links.docs)}
                    >
                      <BookOpen className="mr-1 h-3 w-3 text-[hsl(var(--muted))]" />
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
