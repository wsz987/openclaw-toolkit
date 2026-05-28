export interface Stage1InstallInput {
  projectRoot: string;
  licenseKey?: string;
  installMode?: 'local' | 'remote' | 'npm';
  selectedVersion?: string;
  runtimeDir?: string;
}

export interface Stage1InstallResult {
  workflowId: string;
  status: 'succeeded' | 'failed';
  errors: string[];
}
