import { STATUS_LABELS } from './status.js';

function formatMessage(result) {
  const label = STATUS_LABELS[result.status] ?? result.status;
  const lines = [
    `[${new Date().toISOString()}] ${label}`,
    result.message,
  ];

  if (result.slots?.length) {
    lines.push('');
    lines.push('Citas detectadas:');
    for (const slot of result.slots) {
      lines.push(`  • ${slot}`);
    }
  }

  if (result.apiHint) {
    lines.push('');
    lines.push(`API: ${result.apiHint}`);
  }

  return lines.join('\n');
}

async function notifyConsole(result) {
  const text = formatMessage(result);
  if (result.status === 'SLOTS_AVAILABLE') {
    console.log('\n🟢 ' + text.replace(/\n/g, '\n   '));
  } else if (result.status === 'NO_SLOTS') {
    console.log('🟡 ' + text.replace(/\n/g, '\n   '));
  } else {
    console.error('🔴 ' + text.replace(/\n/g, '\n   '));
  }
}

async function notifyTelegram(result, { bot_token, chat_id }) {
  if (!bot_token || !chat_id) {
    throw new Error('Telegram requiere bot_token y chat_id');
  }

  const text = formatMessage(result);
  const url = `https://api.telegram.org/bot${bot_token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram HTTP ${response.status}: ${body}`);
  }
}

async function notifyWebhook(result, { url }) {
  if (!url) throw new Error('Webhook requiere url');

  const payload = {
    status: result.status,
    statusLabel: STATUS_LABELS[result.status],
    message: result.message,
    slots: result.slots ?? [],
    timestamp: new Date().toISOString(),
    url: result.url,
    branch: result.branch,
    service: result.service,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Webhook HTTP ${response.status}: ${body}`);
  }
}

export async function sendNotifications(result, config) {
  const { notifications } = config;
  const errors = [];

  if (notifications.console !== false) {
    await notifyConsole(result);
  }

  if (notifications.telegram?.enabled && result.status === 'SLOTS_AVAILABLE') {
    try {
      await notifyTelegram(result, notifications.telegram);
    } catch (err) {
      errors.push(`Telegram: ${err.message}`);
    }
  }

  if (notifications.webhook?.enabled && result.status === 'SLOTS_AVAILABLE') {
    try {
      await notifyWebhook(result, notifications.webhook);
    } catch (err) {
      errors.push(`Webhook: ${err.message}`);
    }
  }

  if (errors.length) {
    console.error('Errores de notificación:', errors.join('; '));
  }

  return errors;
}

export { formatMessage };
