import { runStage1InstallWorkflow } from '@openclaw-toolkit/core';

if (import.meta.url.includes('/dist/')) {
  process.env.NODE_ENV = 'production';
}

const result = await runStage1InstallWorkflow({
  projectRoot: process.cwd(),
  licenseKey: process.env.OPENCLAW_LICENSE_KEY ?? '',
  installMode: 'local'
});

console.log(JSON.stringify(result, null, 2));
