import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
  url: 'https://citaprevia.ciencia.gob.es/qmaticwebbooking/#/',
  branch: 'Oficina virtual',
  service: 'Asistencia reconocimiento títulos',
  poll_interval_minutes: 15,
  timeout_seconds: 60,
  proxy: null,
  notifications: {
    console: true,
    telegram: { enabled: false, bot_token: '', chat_id: '' },
    webhook: { enabled: false, url: '' },
    email: { enabled: false },
  },
};

function loadYamlConfig() {
  const configPath = path.join(ROOT, 'config.yaml');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return yaml.load(fs.readFileSync(configPath, 'utf8')) ?? {};
}

function envOr(value, envKey) {
  return process.env[envKey]?.trim() || value;
}

export function loadConfig() {
  const file = loadYamlConfig();
  const merged = structuredClone(DEFAULTS);

  Object.assign(merged, file);
  merged.notifications = {
    ...DEFAULTS.notifications,
    ...(file.notifications ?? {}),
    telegram: {
      ...DEFAULTS.notifications.telegram,
      ...(file.notifications?.telegram ?? {}),
    },
    webhook: {
      ...DEFAULTS.notifications.webhook,
      ...(file.notifications?.webhook ?? {}),
    },
  };

  merged.url = envOr(merged.url, 'BOOKING_URL');
  merged.branch = envOr(merged.branch, 'BOOKING_BRANCH');
  merged.service = envOr(merged.service, 'BOOKING_SERVICE');
  merged.proxy = envOr(merged.proxy, 'PROXY_URL') || null;

  if (process.env.POLL_INTERVAL_MINUTES) {
    merged.poll_interval_minutes = Number(process.env.POLL_INTERVAL_MINUTES);
  }
  if (process.env.TIMEOUT_SECONDS) {
    merged.timeout_seconds = Number(process.env.TIMEOUT_SECONDS);
  }

  const tg = merged.notifications.telegram;
  tg.bot_token = envOr(tg.bot_token, 'TELEGRAM_BOT_TOKEN');
  tg.chat_id = envOr(tg.chat_id, 'TELEGRAM_CHAT_ID');
  if (process.env.TELEGRAM_ENABLED === 'true') tg.enabled = true;

  const wh = merged.notifications.webhook;
  wh.url = envOr(wh.url, 'WEBHOOK_URL');
  if (process.env.WEBHOOK_ENABLED === 'true') wh.enabled = true;

  return merged;
}
