const BASE = 'https://api.telegram.org/bot';

export class TelegramClient {
  constructor({ bot_token, chat_id }) {
    if (!bot_token) throw new Error('Telegram requiere bot_token');
    this.bot_token = bot_token;
    this.chat_id = chat_id ? String(chat_id) : null;
    this.offset = 0;
  }

  apiUrl(method) {
    return `${BASE}${this.bot_token}/${method}`;
  }

  async call(method, body = {}) {
    const response = await fetch(this.apiUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram ${method}: ${data.description ?? response.status}`);
    }
    return data.result;
  }

  async sendMessage(text, options = {}) {
    const chat_id = options.chat_id ?? this.chat_id;
    if (!chat_id) throw new Error('chat_id requerido para sendMessage');
    return this.call('sendMessage', {
      chat_id,
      text,
      parse_mode: options.parse_mode ?? 'Markdown',
      disable_web_page_preview: true,
      reply_markup: options.reply_markup,
    });
  }

  async getUpdates(timeoutSeconds = 30) {
    const result = await this.call('getUpdates', {
      offset: this.offset,
      timeout: timeoutSeconds,
      allowed_updates: ['message'],
    });
    for (const update of result) {
      this.offset = Math.max(this.offset, update.update_id + 1);
    }
    return result;
  }

  async waitForMessage({ chat_id, timeoutMs, filter }) {
    const deadline = Date.now() + timeoutMs;
    const targetChat = String(chat_id ?? this.chat_id);

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const pollTimeout = Math.min(30, Math.ceil(remaining / 1000));
      if (pollTimeout <= 0) break;

      const updates = await this.getUpdates(pollTimeout);
      for (const update of updates) {
        const msg = update.message;
        if (!msg) continue;
        if (String(msg.chat.id) !== targetChat) continue;
        const text = msg.text?.trim();
        if (!text) continue;
        if (filter && !filter(text, msg)) continue;
        return { text, message: msg };
      }
    }

    return null;
  }

  async waitForOtpCode({ chat_id, timeoutMs, promptEmail }) {
    await this.sendMessage(
      `📧 *Verificación de correo*\n\n` +
        `Se ha solicitado un código de verificación en *${promptEmail}*.\n\n` +
        `Envíame el código que recibiste (normalmente 4-6 dígitos).\n` +
        `Tienes ${Math.round(timeoutMs / 60000)} minutos.`,
      { chat_id },
    );

    const result = await this.waitForMessage({
      chat_id,
      timeoutMs,
      filter: (text) => /^\d{4,8}$/.test(text.replace(/\s/g, '')),
    });

    if (!result) return null;
    return result.text.replace(/\s/g, '');
  }
}

export async function sendTelegramAlert({ bot_token, chat_id }, text) {
  const client = new TelegramClient({ bot_token, chat_id });
  await client.sendMessage(text, { parse_mode: undefined });
}
