import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'user-state.yaml');

const PROFILE_FIELDS = [
  'nombre',
  'apellidos',
  'dni',
  'email',
  'telefono',
  'numero_expediente',
];

const FIELD_LABELS = {
  nombre: 'Nombre',
  apellidos: 'Apellidos',
  dni: 'DNI/NIE/Pasaporte',
  email: 'Correo electrónico',
  telefono: 'Teléfono (9 dígitos, sin prefijo)',
  numero_expediente: 'Número de expediente',
};

export function getProfileFieldLabels() {
  return { ...FIELD_LABELS };
}

export function getProfileFields() {
  return [...PROFILE_FIELDS];
}

function normalizeTelefono(value) {
  return String(value ?? '').replace(/\D/g, '').slice(-9);
}

function normalizeDni(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeProfile(raw = {}) {
  return {
    nombre: String(raw.nombre ?? '').trim(),
    apellidos: String(raw.apellidos ?? '').trim(),
    dni: normalizeDni(raw.dni),
    email: String(raw.email ?? '').trim().toLowerCase(),
    telefono: normalizeTelefono(raw.telefono),
    numero_expediente: String(raw.numero_expediente ?? '').trim(),
  };
}

export function validateProfile(profile) {
  const p = normalizeProfile(profile);
  const missing = [];

  if (!p.nombre) missing.push(FIELD_LABELS.nombre);
  if (!p.apellidos) missing.push(FIELD_LABELS.apellidos);
  if (!p.dni) missing.push(FIELD_LABELS.dni);
  if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
    missing.push(FIELD_LABELS.email);
  }
  if (!/^\d{9}$/.test(p.telefono)) missing.push(FIELD_LABELS.telefono);
  if (!p.numero_expediente || p.numero_expediente.length < 9) {
    missing.push(FIELD_LABELS.numero_expediente);
  }

  return { valid: missing.length === 0, missing, profile: p };
}

export function isProfileComplete(profile) {
  return validateProfile(profile).valid;
}

export function formatProfileSummary(profile) {
  const p = normalizeProfile(profile);
  return [
    `👤 *Perfil de reserva*`,
    `• Nombre: ${p.nombre || '—'}`,
    `• Apellidos: ${p.apellidos || '—'}`,
    `• DNI/NIE: ${p.dni || '—'}`,
    `• Email: ${p.email || '—'}`,
    `• Teléfono: ${p.telefono || '—'}`,
    `• Expediente: ${p.numero_expediente || '—'}`,
  ].join('\n');
}

function loadStateFile() {
  if (!fs.existsSync(STATE_PATH)) return {};
  try {
    return yaml.load(fs.readFileSync(STATE_PATH, 'utf8')) ?? {};
  } catch {
    return {};
  }
}

export function saveState(partial) {
  const current = loadStateFile();
  const next = { ...current, ...partial };
  fs.writeFileSync(STATE_PATH, yaml.dump(next, { lineWidth: -1 }), 'utf8');
  return next;
}

export function loadProfileFromEnv() {
  const json = process.env.BOOKING_PROFILE?.trim();
  if (json) {
    try {
      return normalizeProfile(JSON.parse(json));
    } catch {
      console.warn('BOOKING_PROFILE no es JSON válido');
    }
  }

  const fromEnv = normalizeProfile({
    nombre: process.env.BOOKING_NOMBRE,
    apellidos: process.env.BOOKING_APELLIDOS,
    dni: process.env.BOOKING_DNI,
    email: process.env.BOOKING_EMAIL,
    telefono: process.env.BOOKING_TELEFONO,
    numero_expediente: process.env.BOOKING_NUMERO_EXPEDIENTE,
  });

  if (isProfileComplete(fromEnv)) return fromEnv;
  return null;
}

export function loadProfile(configProfile) {
  const fromEnv = loadProfileFromEnv();
  if (fromEnv) return fromEnv;

  const state = loadStateFile();
  if (state.profile && isProfileComplete(state.profile)) {
    return normalizeProfile(state.profile);
  }

  if (configProfile && isProfileComplete(configProfile)) {
    return normalizeProfile(configProfile);
  }

  return normalizeProfile(configProfile ?? state.profile ?? {});
}

export function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  saveState({ profile: normalized });
  return normalized;
}

export function loadAutoBook(configAutoBook) {
  const state = loadStateFile();
  if (typeof state.auto_book === 'boolean') return state.auto_book;
  if (process.env.AUTO_BOOK === 'true') return true;
  if (process.env.AUTO_BOOK === 'false') return false;
  return Boolean(configAutoBook);
}

export function saveAutoBook(enabled) {
  saveState({ auto_book: Boolean(enabled) });
  return Boolean(enabled);
}

export { STATE_PATH };
