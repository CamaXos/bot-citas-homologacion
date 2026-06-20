import { loadConfig } from './config.js';
import { checkAvailability } from './checker.js';
import { sendNotifications } from './notifications.js';
import { Status } from './status.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(config) {
  console.log(`Comprobando citas: ${config.branch} → ${config.service}`);
  const result = await checkAvailability(config);

  await sendNotifications(result, config);

  return result;
}

async function main() {
  const once = process.argv.includes('--once');
  const config = loadConfig();

  if (once) {
    const result = await runOnce(config);
    process.exit(result.status === Status.ERROR || result.status === Status.SITE_DOWN ? 1 : 0);
  }

  console.log(
    `Modo polling cada ${config.poll_interval_minutes} min. Ctrl+C para detener.`,
  );

  while (true) {
    try {
      await runOnce(config);
    } catch (err) {
      console.error('Error inesperado:', err);
    }
    await sleep(config.poll_interval_minutes * 60 * 1000);
  }
}

main();
