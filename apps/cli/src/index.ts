import { runStage1InstallWorkflow } from '@openclaw-toolkit/core';

const result = await runStage1InstallWorkflow({
  projectRoot: process.cwd(),
  licenseKey: 'stage1-dev',
  installMode: 'local'
});

console.log(JSON.stringify(result, null, 2));
