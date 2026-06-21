import { loadConfig } from './config.js';
import { checkAvailability } from './checker.js';
import { bookAppointment } from './booking.js';
import { sendNotifications } from './notifications.js';
import { Status } from './status.js';
import { TelegramClient } from './telegram.js';
import {
  loadProfile,
  saveProfile,
  validateProfile,
  formatProfileSummary,
  isProfileComplete,
  loadAutoBook,
  saveAutoBook,
  getProfileFields,
  getProfileFieldLabels,
} from './profile.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const WIZARD_STEPS = getProfileFields();

export class CitasTelegramBot {
  constructor(config) {
    this.config = config;
    const tg = config.notifications.telegram;
    this.client = new TelegramClient({
      bot_token: tg.bot_token,
      chat_id: tg.chat_id,
    });
    this.chatId = String(tg.chat_id);
    this.wizard = null;
    this.bookingInProgress = false;
    this.otpResolver = null;
  }

  async send(text, options = {}) {
    return this.client.sendMessage(text, { chat_id: this.chatId, ...options });
  }

  helpText() {
    return (
      `🤖 *Bot de citas — Homologación MICIU*\n\n` +
      `Comandos:\n` +
      `/start — Iniciar\n` +
      `/help — Esta ayuda\n` +
      `/perfil — Ver tus datos guardados\n` +
      `/datos — Configurar datos (asistente paso a paso)\n` +
      `/auto on|off — Activar/desactivar reserva automática\n` +
      `/check — Comprobar citas ahora\n` +
      `/cancelar — Cancelar asistente de datos\n\n` +
      `Con *auto on* y perfil completo, al detectar cita el bot intentará reservar y te pedirá el código OTP por aquí.`
    );
  }

  async handleCommand(text) {
    const [cmd, ...args] = text.trim().split(/\s+/);
    const command = cmd.split('@')[0].toLowerCase();

    switch (command) {
      case '/start':
        await this.send(
          `👋 Bot de citas de homologación activo.\n\n${this.helpText()}`,
        );
        break;

      case '/help':
        await this.send(this.helpText());
        break;

      case '/perfil':
      case '/datos': {
        const profile = loadProfile(this.config.profile);
        if (command === '/datos' && args.length === 0 && !isProfileComplete(profile)) {
          await this.startWizard();
        } else if (command === '/datos' && args.length === 0) {
          await this.send(
            `${formatProfileSummary(profile)}\n\n` +
              `Para reconfigurar, escribe /datos de nuevo.`,
          );
          await this.startWizard();
        } else {
          await this.send(formatProfileSummary(profile));
          const { valid, missing } = validateProfile(profile);
          if (!valid) {
            await this.send(
              `⚠️ Perfil incompleto. Faltan: ${missing.join(', ')}\nUsa /datos para completarlo.`,
            );
          }
        }
        break;
      }

      case '/auto': {
        const arg = args[0]?.toLowerCase();
        if (arg === 'on' || arg === 'off') {
          const enabled = saveAutoBook(arg === 'on');
          await this.send(
            enabled
              ? '✅ *Reserva automática activada*. Necesitas perfil completo (/datos).'
              : '⏸ Reserva automática desactivada. Solo alertas.',
          );
        } else {
          const current = loadAutoBook(this.config.auto_book);
          await this.send(
            `Estado: *${current ? 'ON' : 'OFF'}*\nUsa /auto on o /auto off`,
          );
        }
        break;
      }

      case '/check':
        await this.runCheck();
        break;

      case '/cancelar':
        this.wizard = null;
        await this.send('Asistente cancelado.');
        break;

      default:
        if (this.wizard) {
          await this.handleWizardInput(text);
        } else if (this.otpResolver) {
          await this.handleOtpInput(text);
        } else {
          await this.send('Comando no reconocido. Usa /help');
        }
    }
  }

  async startWizard() {
    this.wizard = { step: 0, data: {} };
    const labels = getProfileFieldLabels();
    await this.send(
      `📝 *Configuración de datos*\n\n` +
        `Paso 1/${WIZARD_STEPS.length}: ${labels[WIZARD_STEPS[0]]}\n` +
        `(_/cancelar para abortar_)`,
    );
  }

  async handleWizardInput(text) {
    const field = WIZARD_STEPS[this.wizard.step];
    this.wizard.data[field] = text.trim();
    this.wizard.step += 1;

    if (this.wizard.step >= WIZARD_STEPS.length) {
      const profile = saveProfile(this.wizard.data);
      this.wizard = null;
      const { valid, missing } = validateProfile(profile);
      if (valid) {
        await this.send(`✅ Perfil guardado.\n\n${formatProfileSummary(profile)}`);
      } else {
        await this.send(
          `⚠️ Datos guardados pero incompletos: ${missing.join(', ')}\nRepite /datos`,
        );
      }
      return;
    }

    const labels = getProfileFieldLabels();
    await this.send(
      `Paso ${this.wizard.step + 1}/${WIZARD_STEPS.length}: ${labels[WIZARD_STEPS[this.wizard.step]]}`,
    );
  }

  async handleOtpInput(text) {
    const code = text.replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(code)) {
      await this.send('Código inválido. Envía solo los dígitos (4-8).');
      return;
    }
    if (this.otpResolver) {
      this.otpResolver(code);
      this.otpResolver = null;
    }
  }

  waitForOtp({ email, timeoutMs }) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.otpResolver = null;
        resolve(null);
      }, timeoutMs);

      this.otpResolver = (code) => {
        clearTimeout(timer);
        resolve(code);
      };

      this.send(
        `📧 *Verificación de correo*\n\n` +
          `Se ha solicitado un código en *${email}*.\n\n` +
          `Envíame el código que recibiste.\n` +
          `Tienes ${Math.round(timeoutMs / 60000)} minutos.`,
      );
    });
  }

  async runCheck(manual = true) {
    if (this.bookingInProgress) {
      await this.send('Ya hay una reserva en curso. Espera a que termine.');
      return;
    }

    if (manual) await this.send('🔍 Comprobando disponibilidad...');

    const result = await checkAvailability(this.config);
    await sendNotifications(result, this.config);

    const autoBook = loadAutoBook(this.config.auto_book);
    const profile = loadProfile(this.config.profile);

    if (
      result.status === Status.SLOTS_AVAILABLE &&
      autoBook &&
      isProfileComplete(profile)
    ) {
      await this.send(
        `🟢 *¡Cita detectada!* Iniciando reserva automática...\n` +
          `Huecos: ${result.slots.join(', ')}`,
      );
      await this.runBooking(profile);
    } else if (result.status === Status.SLOTS_AVAILABLE && autoBook) {
      await this.send(
        '⚠️ Hay cita pero el perfil está incompleto. Usa /datos antes de la próxima.',
      );
    } else if (manual && result.status === Status.NO_SLOTS) {
      await this.send('🟡 Sin citas disponibles por ahora.');
    }
  }

  async runBooking(profile) {
    this.bookingInProgress = true;
    try {
      const bookingResult = await bookAppointment(this.config, profile, {
        onStatus: (msg) => this.send(`⏳ ${msg}`).catch(() => {}),
        onOtpRequest: ({ email, timeoutMs }) => this.waitForOtp({ email, timeoutMs }),
      });

      await sendNotifications(bookingResult, this.config);

      if (
        bookingResult.status === Status.BOOKING_SUCCESS ||
        bookingResult.status === Status.BOOKING_PENDING
      ) {
        await this.send(
          `✅ *${bookingResult.message}*\n\nRevisa tu correo *${profile.email}* para la confirmación oficial.`,
        );
      } else if (bookingResult.captcha) {
        await this.send(
          `🛑 ${bookingResult.message}\n\nEntra manualmente: ${this.config.url}`,
        );
      } else {
        await this.send(`❌ ${bookingResult.message}`);
      }
    } finally {
      this.bookingInProgress = false;
    }
  }

  async pollCommands() {
    const updates = await this.client.getUpdates(25);
    for (const update of updates) {
      const msg = update.message;
      if (!msg?.text) continue;
      if (String(msg.chat.id) !== this.chatId) continue;

      try {
        if (this.otpResolver && /^\d{4,8}$/.test(msg.text.replace(/\s/g, ''))) {
          await this.handleOtpInput(msg.text);
        } else if (msg.text.startsWith('/')) {
          await this.handleCommand(msg.text);
        } else if (this.wizard) {
          await this.handleWizardInput(msg.text);
        } else if (this.otpResolver) {
          await this.handleOtpInput(msg.text);
        }
      } catch (err) {
        console.error('Error procesando mensaje:', err);
        await this.send(`Error: ${err.message}`).catch(() => {});
      }
    }
  }

  async run() {
    const tg = this.config.notifications.telegram;
    if (!tg.enabled || !tg.bot_token || !tg.chat_id) {
      throw new Error('Telegram debe estar habilitado con bot_token y chat_id para npm run bot');
    }

    await this.send(
      `🚀 Bot iniciado. Polling cada ${this.config.poll_interval_minutes} min.\n` +
        `Auto-reserva: *${loadAutoBook(this.config.auto_book) ? 'ON' : 'OFF'}*\n\n` +
        `${formatProfileSummary(loadProfile(this.config.profile))}`,
    );

    while (true) {
      try {
        await this.pollCommands();
      } catch (err) {
        console.error('Error en polling Telegram:', err);
      }

      // Comprobación periódica intercalada con polling de comandos
      await this.runCheck(false);

      // Polling rápido de comandos durante el intervalo
      const intervalMs = this.config.poll_interval_minutes * 60 * 1000;
      const pollChunk = 5000;
      const chunks = Math.floor(intervalMs / pollChunk);

      for (let i = 0; i < chunks; i++) {
        try {
          await this.pollCommands();
        } catch (err) {
          console.error('Error en polling Telegram:', err);
        }
        await sleep(pollChunk);
      }
    }
  }
}

async function main() {
  const config = loadConfig();
  const bot = new CitasTelegramBot(config);
  await bot.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
