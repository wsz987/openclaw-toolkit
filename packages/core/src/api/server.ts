import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { runStage1InstallWorkflow } from '../graph/run-stage1-install.js';

export interface CoreServerOptions {
  host?: string;
  port?: number;
  projectRoot: string;
}

export async function startCoreServer(options: CoreServerOptions) {
  const app = Fastify({ logger: true });
  const runtimeToken = randomUUID();

  await app.register(websocket);

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') {
      return;
    }

    const authorization = request.headers.authorization;
    if (authorization !== `Bearer ${runtimeToken}`) {
      await reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/runtime-token', async () => ({ token: runtimeToken }));

  app.post('/api/workflows/stage1-install/start', async (request) => {
    const body = request.body as {
      licenseKey?: string;
      installMode?: 'local' | 'remote' | 'npm';
      selectedVersion?: string;
      runtimeDir?: string;
    };

    const result = await runStage1InstallWorkflow({
      projectRoot: options.projectRoot,
      licenseKey: body.licenseKey,
      installMode: body.installMode,
      selectedVersion: body.selectedVersion,
      runtimeDir: body.runtimeDir
    });

    return result;
  });

  const address = await app.listen({
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 12450
  });

  return { app, address, runtimeToken };
}
