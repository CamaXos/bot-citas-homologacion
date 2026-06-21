import { chromium } from 'playwright';
import {
  navigateToDateTimeStep,
  detectNoSlotsMessage,
  clickFirstAvailableSlot,
  fillContactForm,
  triggerEmailVerification,
  enterVerificationCode,
  submitBooking,
  detectCaptcha,
  detectBookingSuccess,
  detectBookingError,
  findAvailableSlots,
} from './qmatic-nav.js';
import { Status } from './status.js';

function buildResult(status, message, extra = {}) {
  return { status, message, slots: [], ...extra };
}

export async function bookAppointment(config, profile, { onOtpRequest, onStatus }) {
  const timeoutMs = config.timeout_seconds * 1000;
  const launchOptions = { headless: true };
  if (config.proxy) {
    launchOptions.proxy = { server: config.proxy };
  }

  let browser;
  const notify = (msg) => onStatus?.(msg);

  try {
    notify('Iniciando navegador para reserva...');
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      locale: 'es-ES',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    notify('Cargando formulario Qmatic...');
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(
      () => document.title && document.title !== 'Loading',
      { timeout: timeoutMs },
    );

    notify('Seleccionando sucursal y servicio...');
    await navigateToDateTimeStep(page, config);

    const noSlotsText = await detectNoSlotsMessage(page);
    if (noSlotsText) {
      return buildResult(Status.NO_SLOTS, noSlotsText);
    }

    const slots = await findAvailableSlots(page);
    if (!slots.length) {
      return buildResult(
        Status.NO_SLOTS,
        'No hay huecos disponibles en este momento.',
      );
    }

    notify(`Seleccionando hueco: ${slots[0].text}`);
    const selectedSlot = await clickFirstAvailableSlot(page);
    if (!selectedSlot) {
      return buildResult(Status.ERROR, 'No se pudo seleccionar un hueco.');
    }

    notify('Rellenando datos de contacto...');
    await fillContactForm(page, profile);

    if (await detectCaptcha(page)) {
      return buildResult(
        Status.ERROR,
        'Captcha detectado. La reserva automática no puede continuar. Entra manualmente en la web.',
        { slots: [selectedSlot], captcha: true },
      );
    }

    notify('Solicitando verificación de correo...');
    const verificationTriggered = await triggerEmailVerification(page);

    if (verificationTriggered || config.validate_email !== false) {
      notify('Esperando código OTP por Telegram...');
      const otpTimeoutMs = (config.otp_timeout_minutes ?? 8) * 60 * 1000;
      const code = await onOtpRequest({
        email: profile.email,
        timeoutMs: otpTimeoutMs,
      });

      if (!code) {
        return buildResult(
          Status.ERROR,
          `Tiempo agotado esperando código OTP (${config.otp_timeout_minutes ?? 8} min).`,
          { slots: [selectedSlot], otpTimeout: true },
        );
      }

      notify('Introduciendo código de verificación...');
      await enterVerificationCode(page, code);
      await page.waitForTimeout(2000);
    }

    if (await detectCaptcha(page)) {
      return buildResult(
        Status.ERROR,
        'Captcha bloqueó el envío. Completa la reserva manualmente.',
        { slots: [selectedSlot], captcha: true },
      );
    }

    notify('Enviando formulario de reserva...');
    const submitted = await submitBooking(page);

    if (!submitted) {
      const err = await detectBookingError(page);
      return buildResult(
        Status.ERROR,
        err ?? 'No se pudo enviar el formulario (botón deshabilitado o paso incompleto).',
        { slots: [selectedSlot] },
      );
    }

    await page.waitForTimeout(3000);

    if (await detectBookingSuccess(page)) {
      return buildResult(
        Status.BOOKING_SUCCESS,
        `Cita reservada para ${selectedSlot}. Revisa ${profile.email} para la confirmación.`,
        { slots: [selectedSlot], booked: true },
      );
    }

    const err = await detectBookingError(page);
    if (err) {
      return buildResult(Status.ERROR, err, { slots: [selectedSlot] });
    }

    return buildResult(
      Status.BOOKING_PENDING,
      `Formulario enviado para ${selectedSlot}. Revisa ${profile.email} — la confirmación puede tardar unos minutos.`,
      { slots: [selectedSlot], booked: true },
    );
  } catch (err) {
    return buildResult(
      Status.ERROR,
      `Error durante la reserva: ${err.message}`,
    );
  } finally {
    if (browser) await browser.close();
  }
}
