import { buildApp } from './app.js';
import { loadAppConfig } from './config/load-app-config.js';

async function start(): Promise<void> {
  const config = loadAppConfig();
  const app = await buildApp(config);

  const close = async (): Promise<void> => {
    await app.close();
  };

  process.once('SIGINT', close);
  process.once('SIGTERM', close);

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error.';

  process.stderr.write(`Admin API failed to start: ${message}\n`);
  process.exitCode = 1;
});
