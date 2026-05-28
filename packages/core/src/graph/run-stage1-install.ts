import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMachine, createActor, fromPromise, assign } from 'xstate';
import type { Stage1InstallInput, Stage1InstallResult } from './workflow-contracts.js';
import type { WorkflowContext, WorkflowStep } from './types.js';
import {
  backupExistingRuntimeStep,
  checkEnvironmentStep,
  configureBrowserStep,
  configurePermissionsStep,
  generateOpenClawConfigStep,
  installRuntimeStep,
  installSkillsStep,
  loadManifestStep,
  resolveArtifactStep,
  rollbackRuntimeStep,
  selectInstallModeStep,
  validateLicenseStep,
  verifyArtifactStep,
  verifyRuntimeStep,
  writeInstalledManifestStep
} from './steps/index.js';

async function runStep(step: WorkflowStep, ctx: WorkflowContext): Promise<void> {
  await step.run(ctx);
}

export async function runStage1InstallWorkflow(input: Stage1InstallInput): Promise<Stage1InstallResult> {
  const runtimeDir = input.runtimeDir ?? path.join(input.projectRoot, 'runtime', 'openclaw');
  const workflowContext: WorkflowContext = {
    workflowId: randomUUID(),
    projectRoot: input.projectRoot,
    runtimeDir,
    configPath: path.join(runtimeDir, 'openclaw.json'),
    licenseKey: input.licenseKey,
    installMode: input.installMode,
    selectedVersion: input.selectedVersion,
    errors: []
  };

  const machine = createMachine({
    id: 'stage1Install',
    initial: 'loadManifest',
    context: workflowContext,
    states: {
      loadManifest: {
        invoke: {
          src: fromPromise(({ input }) => runStep(loadManifestStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'validateLicense',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      validateLicense: {
        invoke: {
          src: fromPromise(({ input }) => runStep(validateLicenseStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'checkEnvironment',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      checkEnvironment: {
        invoke: {
          src: fromPromise(({ input }) => runStep(checkEnvironmentStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'selectInstallMode',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      selectInstallMode: {
        invoke: {
          src: fromPromise(({ input }) => runStep(selectInstallModeStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'resolveArtifact',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      resolveArtifact: {
        invoke: {
          src: fromPromise(({ input }) => runStep(resolveArtifactStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'verifyArtifact',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      verifyArtifact: {
        invoke: {
          src: fromPromise(({ input }) => runStep(verifyArtifactStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'backupExistingRuntime',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      backupExistingRuntime: {
        invoke: {
          src: fromPromise(({ input }) => runStep(backupExistingRuntimeStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'installRuntime',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      installRuntime: {
        invoke: {
          src: fromPromise(({ input }) => runStep(installRuntimeStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'writeInstalledManifest',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      writeInstalledManifest: {
        invoke: {
          src: fromPromise(({ input }) => runStep(writeInstalledManifestStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'generateOpenClawConfig',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      generateOpenClawConfig: {
        invoke: {
          src: fromPromise(({ input }) => runStep(generateOpenClawConfigStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'installSkills',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      installSkills: {
        invoke: {
          src: fromPromise(({ input }) => runStep(installSkillsStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'configurePermissions',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      configurePermissions: {
        invoke: {
          src: fromPromise(({ input }) => runStep(configurePermissionsStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'configureBrowser',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      configureBrowser: {
        invoke: {
          src: fromPromise(({ input }) => runStep(configureBrowserStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'verifyRuntime',
          onError: { target: 'rollback', actions: 'captureError' }
        }
      },
      verifyRuntime: {
        invoke: {
          src: fromPromise(({ input }) => runStep(verifyRuntimeStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'finished',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      rollback: {
        invoke: {
          src: fromPromise(({ input }) => runStep(rollbackRuntimeStep, input as WorkflowContext)),
          input: ({ context }) => context,
          onDone: 'failed',
          onError: { target: 'failed', actions: 'captureError' }
        }
      },
      failed: { type: 'final' },
      finished: { type: 'final' }
    }
  }, {
    actions: {
      captureError: assign({
        errors: ({ context, event }) => {
          const message = event.type.includes('error') && 'error' in event
            ? String(event.error instanceof Error ? event.error.message : event.error)
            : '工作流执行失败';
          return [...context.errors, message];
        }
      })
    }
  });

  const actor = createActor(machine);
  actor.start();

  const snapshot = await new Promise<ReturnType<typeof actor.getSnapshot>>((resolve) => {
    const subscription = actor.subscribe((state) => {
      if (state.status === 'done') {
        subscription.unsubscribe();
        resolve(state);
      }
    });
  });

  return {
    workflowId: workflowContext.workflowId,
    status: snapshot.value === 'finished' ? 'succeeded' : 'failed',
    errors: snapshot.context.errors
  };
}
