# Bot de citas — Homologación de títulos (MICIU)

Monitor automático de disponibilidad de citas en el sistema Qmatic del Ministerio de Ciencia, Innovación y Universidades.

**URL:** https://citaprevia.ciencia.gob.es/qmaticwebbooking/#/

## Flujo que automatiza el bot

El bot replica el flujo manual en la web:

1. **Seleccionar sucursal:** `Oficina virtual` (en la web aparece como *"Oficina asistencia telefónica Oficina virtual"*)
2. **Seleccionar servicio:** `Asistencia reconocimiento títulos`
3. **Seleccionar fecha y hora:** detecta si hay huecos o el mensaje *"Actualmente no hay citas disponibles..."*

## Estados que distingue

| Estado | Significado |
|--------|-------------|
| `SLOTS_AVAILABLE` | Hay citas — **se envía alerta** |
| `NO_SLOTS` | Sitio accesible, sin citas — sin alerta |
| `SITE_DOWN` | Timeout, error de conexión o HTTP 5xx — **se envía alerta** |
| `IP_BLOCKED` | HTTP 403/429, captcha, WAF o página inesperada — **se envía alerta** |
| `ERROR` | Otro fallo durante la automatización — **se envía alerta** |

## Requisitos

- Node.js 18+
- Chromium (instalado automáticamente con Playwright)

## Instalación local (solo para pruebas)

```bash
git clone <tu-repo>
cd bot-citas-homologacion
npm install
npx playwright install chromium
cp config.example.yaml config.yaml
# Edita config.yaml si necesitas proxy o Telegram
npm run check
```

Modo continuo (polling local):

```bash
npm start
```

## Configuración

Copia `config.example.yaml` → `config.yaml` o usa variables de entorno:

| Variable | Descripción |
|----------|-------------|
| `BOOKING_URL` | URL del formulario |
| `BOOKING_BRANCH` | Texto parcial de la sucursal (default: `Oficina virtual`) |
| `BOOKING_SERVICE` | Texto parcial del servicio |
| `PROXY_URL` | Proxy HTTP/HTTPS, ej. `http://user:pass@host:8080` |
| `POLL_INTERVAL_MINUTES` | Intervalo en modo `npm start` |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram |
| `TELEGRAM_CHAT_ID` | Chat ID de destino |
| `WEBHOOK_URL` | URL POST para alertas JSON |

### Proxy (si tu IP está bloqueada)

En `config.yaml`:

```yaml
proxy: "http://usuario:contraseña@proxy.ejemplo.com:8080"
```

O con variable de entorno:

```bash
export PROXY_URL="http://usuario:contraseña@proxy.ejemplo.com:8080"
npm run check
```

Servicios proxy gratuitos/de prueba suelen ser inestables; para producción conviene un proxy residencial de pago.

### Notificaciones Telegram

1. Habla con [@BotFather](https://t.me/BotFather) y crea un bot.
2. Obtén tu `chat_id` (p. ej. con [@userinfobot](https://t.me/userinfobot)).
3. Configura en `config.yaml`:

```yaml
notifications:
  telegram:
    enabled: true
    bot_token: "123456:ABC..."
    chat_id: "987654321"
```

### Webhook

Recibe un POST JSON:

```json
{
  "status": "SLOTS_AVAILABLE",
  "statusLabel": "Citas disponibles",
  "message": "¡Hay 3 hueco(s) disponible(s)!...",
  "slots": ["10:30", "11:00"],
  "timestamp": "2026-06-20T12:00:00.000Z",
  "url": "https://citaprevia.ciencia.gob.es/...",
  "branch": "Oficina virtual",
  "service": "Asistencia reconocimiento títulos"
}
```

Úsalo con n8n, Zapier, Discord, email (SendGrid/Resend), etc.

---

## Despliegue en la nube (GRATIS) — Recomendado: GitHub Actions

**Por qué GitHub Actions:** ejecuta en servidores de GitHub (IP distinta a la tuya), es gratis para repos públicos (~2000 min/mes) y permite cron cada 15 minutos sin mantener un servidor.

### Paso a paso

1. **Sube el repo a GitHub** (público o privado).

2. **Secrets** (Settings → Secrets and variables → Actions):

   | Secret | Obligatorio | Uso |
   |--------|-------------|-----|
   | `TELEGRAM_BOT_TOKEN` | No | Alertas Telegram |
   | `TELEGRAM_CHAT_ID` | No | Alertas Telegram |
   | `WEBHOOK_URL` | No | Alertas webhook |
   | `PROXY_URL` | No | Si GitHub también está bloqueado |

3. **Activa Actions:** el workflow `.github/workflows/check-citas.yml` se ejecuta:
   - Cada **15 minutos** (cron)
   - Manualmente desde **Actions → Comprobar citas homologación → Run workflow**

4. **Revisa logs:** en la pestaña Actions verás 🟢/🟡/🔴 según el resultado. Cada ejecución guarda un artefacto `last-check-log` con la salida completa.

> **Nota:** Telegram y webhook alertan cuando hay citas (`SLOTS_AVAILABLE`) o errores (`IP_BLOCKED`, `SITE_DOWN`, `ERROR`). No avisan en comprobaciones normales sin citas (`NO_SLOTS`), para evitar spam cada 15 min.

> **Nota:** GitHub puede retrasar jobs `cron` en repos gratuitos varios minutos. Para avisos urgentes, combina con ejecución manual o un segundo trigger externo (p. ej. cron-job.org llamando `workflow_dispatch` vía API).

### Alternativas baratas

| Opción | Coste | Comentario |
|--------|-------|------------|
| **GitHub Actions** | Gratis | **Recomendada** — ver arriba |
| **Oracle Cloud Free Tier** | Gratis | VM ARM perpetua; requiere mantener Node + cron |
| **Google Cloud Run Jobs** | ~0–2 €/mes | Contenedor Docker + Cloud Scheduler |
| **Railway / Render cron** | ~5 €/mes | Más simple pero de pago |

---

## Cómo detecta las citas

1. **UI (Playwright):** mensaje verde de “no hay citas” vs botones de horario / días disponibles.
2. **API interna (passiva):** intercepta respuestas JSON de Qmatic con `timeslot`, `calendar`, `schedule` en la URL cuando la web las solicita.

La API pública de Qmatic requiere OAuth (Client ID/Secret) y no está disponible para este portal.

---

## Estructura del proyecto

```
bot-citas-homologacion/
├── .github/workflows/check-citas.yml   # Cron en la nube
├── config.example.yaml
├── package.json
├── README.md
└── src/
    ├── index.js          # Entrada CLI / polling
    ├── checker.js        # Automatización Playwright
    ├── config.js         # Carga YAML + env
    ├── notifications.js  # Consola, Telegram, webhook
    └── status.js         # Constantes de estado
```

---

## Reservar la cita (manual)

Cuando recibas alerta de `SLOTS_AVAILABLE`, entra tú mismo en la web y completa el paso 4 (detalles de contacto). Este bot **no reserva** citas automáticamente.

---

## Licencia

MIT — uso personal. Respeta los términos del sitio web del ministerio.
