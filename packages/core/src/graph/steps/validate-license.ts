import {
  ensureInstallModeAllowed,
  ensureLicenseFeature,
  verifyOfflineLicense
} from '../../license/verify-license.js';
import type { WorkflowStep } from '../types.js';
import path from 'node:path';

export const validateLicenseStep: WorkflowStep = {
  id: 'validateLicense',
  title: '校验离线授权',
  description: '通过内置公钥离线校验激活码、授权文件和套餐等级',
  async run(ctx) {
    const license = await verifyOfflineLicense(
      ctx.licenseKey ?? '',
      path.join(ctx.projectRoot, 'artifacts', 'license.dat')
    );
    ctx.license = license;
    ctx.tier = license.tier;

    ensureLicenseFeature(license, 'managed-node-runtime');
    ensureInstallModeAllowed(license, ctx.installMode ?? 'local');
  }
};
