import { verifyOfflineLicense } from '../../license/verify-license.js';
import type { WorkflowStep } from '../types.js';

export const validateLicenseStep: WorkflowStep = {
  id: 'validateLicense',
  title: '校验离线授权',
  description: '通过内置公钥离线校验激活密钥和套餐等级',
  async run(ctx) {
    const license = await verifyOfflineLicense(ctx.licenseKey ?? 'stage1-dev');
    ctx.license = license;
    ctx.tier = license.tier;

    if (!license.features.includes('offline-install')) {
      throw new Error('当前授权不包含 Stage 1 离线部署能力');
    }
  }
};
