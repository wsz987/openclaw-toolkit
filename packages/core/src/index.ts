import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCoreServer } from './api/server.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = process.env.OPENCLAW_TOOLKIT_ROOT ?? path.resolve(currentDir, '..', '..', '..');

const server = await startCoreServer({ projectRoot });

console.log(JSON.stringify({
  type: 'core-ready',
  address: server.address,
  token: server.runtimeToken
}));
