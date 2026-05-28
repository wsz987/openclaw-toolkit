export type InstallMode = 'local' | 'remote' | 'npm';

export type ServiceTier = 'stage-1' | 'stage-2';

export type WorkflowStatus = 'idle' | 'running' | 'succeeded' | 'failed';

export interface WorkflowEvent {
  workflowId: string;
  stepId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}
