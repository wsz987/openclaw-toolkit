import { loadProviderCatalog, loadReleaseManifest, loadToolkitManifest } from '../../manifest/manifest-store.js';
import type { WorkflowStep } from '../types.js';

export const loadManifestStep: WorkflowStep = {
  id: 'loadManifest',
  title: '加载版本清单',
  description: '读取工具包和 OpenClaw 制品版本清单',
  async run(ctx) {
    ctx.toolkitManifest = await loadToolkitManifest(ctx.projectRoot);
    ctx.providerCatalog = await loadProviderCatalog(ctx.projectRoot);
    ctx.releaseManifest = await loadReleaseManifest(ctx.projectRoot);
    ctx.selectedVersion ??= ctx.toolkitManifest.defaultOpenClawVersion;
  }
};
