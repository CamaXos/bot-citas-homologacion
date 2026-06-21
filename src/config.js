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
  otp_timeout_minutes: 8,
  auto_book: false,
  validate_email: true,
  proxy: null,
  profile: {
    nombre: '',
    apellidos: '',
    dni: '',
    email: '',
    telefono: '',
    numero_expediente: '',
  },
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
  merged.profile = { ...DEFAULTS.profile, ...(file.profile ?? {}) };
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
  if (process.env.OTP_TIMEOUT_MINUTES) {
    merged.otp_timeout_minutes = Number(process.env.OTP_TIMEOUT_MINUTES);
  }
  if (process.env.AUTO_BOOK === 'true') merged.auto_book = true;
  if (process.env.AUTO_BOOK === 'false') merged.auto_book = false;

  // Perfil desde env (BOOKING_PROFILE JSON o campos individuales)
  const profileJson = process.env.BOOKING_PROFILE?.trim();
  if (profileJson) {
    try {
      Object.assign(merged.profile, JSON.parse(profileJson));
    } catch {
      console.warn('BOOKING_PROFILE no es JSON válido');
    }
  }
  const profileEnvMap = {
    nombre: 'BOOKING_NOMBRE',
    apellidos: 'BOOKING_APELLIDOS',
    dni: 'BOOKING_DNI',
    email: 'BOOKING_EMAIL',
    telefono: 'BOOKING_TELEFONO',
    numero_expediente: 'BOOKING_NUMERO_EXPEDIENTE',
  };
  for (const [key, envKey] of Object.entries(profileEnvMap)) {
    if (process.env[envKey]) merged.profile[key] = process.env[envKey];
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
