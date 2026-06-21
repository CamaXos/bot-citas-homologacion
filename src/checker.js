import { chromium } from 'playwright';
import { Status } from './status.js';
import {
  navigateToDateTimeStep,
  detectNoSlotsMessage,
  findAvailableSlots,
  escapeRegex,
} from './qmatic-nav.js';

const BLOCKED_PATTERNS = [
  /access denied/i,
  /forbidden/i,
  /blocked/i,
  /no autorizado/i,
  /captcha/i,
  /cloudflare/i,
  /error 403/i,
  /error 429/i,
];

function buildResult(status, message, extra = {}) {
  return { status, message, slots: [], ...extra };
}

function classifyHttpError(statusCode) {
  if (statusCode === 403 || statusCode === 429) {
    return Status.IP_BLOCKED;
  }
  if (statusCode >= 500) {
    return Status.SITE_DOWN;
  }
  return Status.ERROR;
}

function parseTimeslotsFromApi(body) {
  const slots = [];

  if (Array.isArray(body)) {
    for (const item of body) {
      if (typeof item === 'string') {
        slots.push(item);
      } else if (item?.startTime || item?.start) {
        const start = item.startTime ?? item.start;
        const end = item.endTime ?? item.end ?? '';
        slots.push(end ? `${start} – ${end}` : String(start));
      } else if (item?.time) {
        slots.push(String(item.time));
      }
    }
  } else if (body && typeof body === 'object') {
    for (const key of ['timeslots', 'timeSlots', 'slots', 'availableTimes']) {
      if (Array.isArray(body[key])) {
        slots.push(...parseTimeslotsFromApi(body[key]));
      }
    }
  }

  return [...new Set(slots)];
}

async function detectBlockedContent(page, httpStatus) {
  if (httpStatus === 403 || httpStatus === 429) return true;

  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');

  if (!bodyText.trim() || title.toLowerCase() === 'loading') {
    return false;
  }

  if (!/reserva de cita/i.test(title) && !/qmatic|ministerio|ciencia/i.test(bodyText)) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(bodyText) || pattern.test(title)) return true;
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(bodyText.slice(0, 500))) return true;
  }

  return false;
}

export async function checkAvailability(config) {
  const timeoutMs = config.timeout_seconds * 1000;

  const launchOptions = { headless: true };
  if (config.proxy) {
    launchOptions.proxy = { server: config.proxy };
  }

  let browser;
  const capturedApiSlots = [];
  let apiHint = null;

  try {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      locale: 'es-ES',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    page.on('response', async (response) => {
      const url = response.url();
      if (!/timeslot|time-slot|calendar|schedule|availability|dates/i.test(url)) {
        return;
      }
      if (response.status() !== 200) return;

      try {
        const contentType = response.headers()['content-type'] ?? '';
        if (!contentType.includes('json')) return;
        const json = await response.json();
        const parsed = parseTimeslotsFromApi(json);
        if (parsed.length) {
          capturedApiSlots.push(...parsed);
          apiHint = url.split('?')[0];
        }
      } catch {
        // Ignorar respuestas no JSON
      }
    });

    let httpStatus = null;
    const mainResponse = await page
      .goto(config.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
      .catch((err) => {
        if (/timeout|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION/i.test(err.message)) {
          throw Object.assign(err, { code: 'SITE_DOWN' });
        }
        throw err;
      });

    httpStatus = mainResponse?.status() ?? null;

    if (httpStatus && httpStatus >= 400) {
      const status = classifyHttpError(httpStatus);
      return buildResult(
        status,
        `HTTP ${httpStatus} al cargar ${config.url}`,
        { url: config.url, branch: config.branch, service: config.service, httpStatus },
      );
    }

    await page.waitForFunction(
      () => document.title && document.title !== 'Loading',
      { timeout: timeoutMs },
    );

    if (await detectBlockedContent(page, httpStatus)) {
      return buildResult(
        Status.IP_BLOCKED,
        'La página no parece accesible desde esta IP (bloqueo, captcha o WAF). Prueba con proxy.',
        { url: config.url, branch: config.branch, service: config.service, httpStatus },
      );
    }

    await navigateToDateTimeStep(page, config);

    const noSlotsText = await detectNoSlotsMessage(page);
    const uiSlots = (await findAvailableSlots(page)).map((s) => s.text);
    const allSlots = [...new Set([...capturedApiSlots, ...uiSlots])];

    const base = {
      url: config.url,
      branch: config.branch,
      service: config.service,
      apiHint,
    };

    if (allSlots.length > 0) {
      return buildResult(
        Status.SLOTS_AVAILABLE,
        `¡Hay ${allSlots.length} hueco(s) disponible(s)!`,
        { ...base, slots: allSlots },
      );
    }

    if (noSlotsText) {
      return buildResult(Status.NO_SLOTS, noSlotsText, base);
    }

    const step3 = page.getByRole('heading', { name: /SELECCIONAR FECHA Y HORA/i });
    const step3Visible = await step3.isVisible().catch(() => false);

    if (!step3Visible) {
      return buildResult(
        Status.ERROR,
        'No se pudo completar el flujo hasta la pantalla de fecha/hora.',
        base,
      );
    }

    return buildResult(
      Status.NO_SLOTS,
      'Pantalla de fecha/hora accesible pero no se detectaron citas (calendario vacío).',
      base,
    );
  } catch (err) {
    if (err.code === 'SITE_DOWN' || /timeout|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ECONNREFUSED/i.test(err.message)) {
      return buildResult(
        Status.SITE_DOWN,
        `No se pudo conectar con el sitio: ${err.message}`,
        { url: config.url, branch: config.branch, service: config.service },
      );
    }

    if (/403|429|blocked|forbidden/i.test(err.message)) {
      return buildResult(
        Status.IP_BLOCKED,
        `Posible bloqueo por IP: ${err.message}`,
        { url: config.url, branch: config.branch, service: config.service },
      );
    }

    return buildResult(
      Status.ERROR,
      err.message,
      { url: config.url, branch: config.branch, service: config.service },
    );
  } finally {
    if (browser) await browser.close();
  }
}

export { escapeRegex };
