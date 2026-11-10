import { buildApp } from './app.js';
import { GuardError, loadConfig } from './config.js';

try {
  const config = loadConfig(process.env);
  const app = buildApp(config);
  await app.listen({ host: config.host, port: config.port });
  const stop = () => void app.close().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (err) {
  console.error(
    err instanceof GuardError ? err.message : `Failed to start: ${(err as Error).message}`,
  );
  process.exit(1);
}
