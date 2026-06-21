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

Modo continuo (polling local, solo detección):

```bash
npm start
```

Modo bot interactivo (Telegram + reserva automática):

```bash
npm run bot
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
| `AUTO_BOOK` | `true` para reserva automática (solo con `npm run bot`) |
| `BOOKING_PROFILE` | JSON con datos personales (nube) |
| `BOOKING_NOMBRE`, `BOOKING_APELLIDOS`, … | Campos sueltos del perfil |
| `OTP_TIMEOUT_MINUTES` | Espera máxima del código OTP (default 8) |

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
   - Cada **~15 minutos** (cron de GitHub, puede tardar en activarse en repos nuevos)
   - Manualmente desde **Actions → Comprobar citas homologación → Run workflow**
   - Desde fuera con **`repository_dispatch`** (recomendado si el cron no dispara)

4. **Si el cron NO corre solo** (solo ves ejecuciones manuales): sigue la guía **[docs/CRON-EXTERNO.md](docs/CRON-EXTERNO.md)** — cron-job.org gratuito llama a la API de GitHub cada 15 min. Tarda 5 minutos en configurar.

5. **Revisa logs:** en la pestaña Actions verás 🟢/🟡/🔴 según el resultado. Cada ejecución guarda un artefacto `last-check-log` con la salida completa.

> **Nota:** Telegram y webhook alertan cuando hay citas (`SLOTS_AVAILABLE`) o errores (`IP_BLOCKED`, `SITE_DOWN`, `ERROR`). No avisan en comprobaciones normales sin citas (`NO_SLOTS`), para evitar spam cada 15 min.

> **Nota:** El `schedule` de GitHub no es fiable al 100 % (retrasos, repos nuevos, picos a en punto). El método externo de `docs/CRON-EXTERNO.md` es la opción más estable sin coste.

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
├── .github/workflows/check-citas.yml   # Cron en la nube (solo detección)
├── config.example.yaml
├── package.json
├── README.md
└── src/
    ├── index.js          # Entrada CLI / polling (detección)
    ├── telegram-bot.js   # Bot Telegram + reserva automática
    ├── checker.js        # Automatización Playwright (detección)
    ├── booking.js        # Reserva automática + OTP
    ├── qmatic-nav.js     # Navegación y formulario Qmatic
    ├── profile.js        # Perfil de usuario
    ├── telegram.js     # Cliente API Telegram
    ├── config.js         # Carga YAML + env
    ├── notifications.js  # Consola, Telegram, webhook
    └── status.js         # Constantes de estado
```

---

## Reservar la cita (manual)

Cuando recibas alerta de `SLOTS_AVAILABLE`, entra tú mismo en la web y completa el paso 4 (detalles de contacto).

Para **reserva automática semi-interactiva** (rellena el formulario y te pide el código OTP por Telegram), sigue la sección [Reserva automática](#reserva-automática) más abajo.

---

## Reserva automática

El bot puede **detectar una cita, rellenar tus datos en Qmatic, solicitar verificación de correo y pedirte el código OTP por Telegram** para completar la reserva.

### Requisitos

- Proceso **long-running** (`npm run bot`) — GitHub Actions **no sirve** para esperar el OTP (~8 min).
- Perfil completo (nombre, apellidos, DNI/NIE, email, teléfono, nº expediente).
- Bot de Telegram configurado (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`).

### Configurar tus datos

**Opción A — Telegram (recomendado):**

1. Despliega el bot (`npm run bot` en local o en Railway/Render).
2. En Telegram, escribe `/datos` y sigue el asistente (6 pasos).
3. Verifica con `/perfil`.
4. Activa reserva: `/auto on`.

**Opción B — `config.yaml` local (gitignored):**

```yaml
auto_book: true
profile:
  nombre: "María"
  apellidos: "García López"
  dni: "X1234567L"
  email: "tu@email.com"
  telefono: "637282322"
  numero_expediente: "1234567890"
notifications:
  telegram:
    enabled: true
    bot_token: "..."
    chat_id: "..."
```

**Opción C — Variables de entorno (nube):**

```bash
BOOKING_PROFILE='{"nombre":"...","apellidos":"...","dni":"...","email":"...","telefono":"...","numero_expediente":"..."}'
AUTO_BOOK=true
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_ENABLED=true
```

O campos sueltos: `BOOKING_NOMBRE`, `BOOKING_APELLIDOS`, `BOOKING_DNI`, `BOOKING_EMAIL`, `BOOKING_TELEFONO`, `BOOKING_NUMERO_EXPEDIENTE`.

### Comandos Telegram

| Comando | Acción |
|---------|--------|
| `/start`, `/help` | Ayuda |
| `/datos` | Asistente para guardar perfil |
| `/perfil` | Ver datos guardados |
| `/auto on\|off` | Activar/desactivar reserva automática |
| `/check` | Comprobar citas ahora |
| `/cancelar` | Cancelar asistente `/datos` |

Durante una reserva, envía el **código numérico** que recibas en tu correo (4–8 dígitos).

### Flujo OTP (qué ocurre cuando hay cita)

```mermaid
sequenceDiagram
  participant Bot as Bot (Playwright)
  participant Web as Qmatic
  participant TG as Telegram
  participant User as Tú

  Bot->>Web: Selecciona hueco + rellena formulario
  Bot->>Web: Clic "Enviar código" (verificación email)
  Bot->>TG: "Envíame el código recibido en tu@email.com"
  Web->>User: Email con código
  User->>TG: 123456
  TG->>Bot: Código OTP
  Bot->>Web: Introduce código + envía reserva
  Bot->>TG: "Cita reservada. Revisa tu correo"
```

1. El bot selecciona el **primer hueco** disponible.
2. Rellena: Nombre, Apellido, NIE/DNI, Email, Teléfono, Nº expediente, acepta términos.
3. Pulsa verificación de correo en la web.
4. Te escribe por Telegram pidiendo el código (timeout configurable, default **8 min**).
5. Introduce el código, envía el formulario y te avisa del resultado.

> **Importante:** Qmatic reserva el hueco ~**10 minutos** (`reservationExpiryTimeSeconds: 600`). El OTP debe llegar antes de que expire.

### Limitaciones

| Limitación | Detalle |
|------------|---------|
| **Captcha reCAPTCHA** | Si aparece, el bot **no puede** resolverlo. Te avisa para reservar manualmente. |
| **Timeout OTP** | Default 8 min (`otp_timeout_minutes`). Ajustable en config. |
| **Timeout hueco** | ~10 min desde que eliges hora en Qmatic. |
| **Email lento** | Si no recibes el código, revisa spam; el bot esperará hasta el timeout. |
| **Primer hueco** | Reserva el primer slot detectado, no puedes elegir hora concreta por Telegram. |
| **GitHub Actions** | Solo detección/alertas. **No** reserva interactiva. |

### Desplegar bot interactivo en la nube (gratis)

GitHub Actions sigue siendo útil para **solo detectar** citas. Para **reserva automática** necesitas un servicio que ejecute `npm run bot` 24/7.

#### Railway (recomendado, tier gratuito limitado)

1. Cuenta en [railway.app](https://railway.app).
2. **New Project → Deploy from GitHub** → selecciona este repo.
3. **Variables** (Settings → Variables):

   | Variable | Valor |
   |----------|-------|
   | `TELEGRAM_BOT_TOKEN` | Token de @BotFather |
   | `TELEGRAM_CHAT_ID` | Tu chat ID |
   | `TELEGRAM_ENABLED` | `true` |
   | `AUTO_BOOK` | `true` |
   | `BOOKING_PROFILE` | JSON con tus datos (ver arriba) |
   | `POLL_INTERVAL_MINUTES` | `15` |

4. **Start command:** `npm run bot`
5. **Build command:** `npm ci && npx playwright install --with-deps chromium`

#### Render (free tier)

1. [render.com](https://render.com) → **New → Background Worker**.
2. Repo GitHub, comando: `npm run bot`.
3. Añade las mismas variables de entorno.
4. En **Build Command:** `npm ci && npx playwright install --with-deps chromium`

> El free tier de Render puede “dormir” el worker; Railway suele ser más estable para polling continuo.

#### Oracle Cloud Free Tier

1. VM ARM gratuita (Always Free).
2. Instala Node.js 24+, clona el repo, `npm ci && npx playwright install chromium`.
3. Crea `config.yaml` o exporta variables de entorno.
4. Ejecuta con **systemd** o **pm2**: `npm run bot`.

#### Local (pruebas)

```bash
cp config.example.yaml config.yaml
# Edita config.yaml con Telegram
npm run bot
```

### GitHub Actions vs bot interactivo

| Modo | Comando | Uso |
|------|---------|-----|
| Solo detectar | GitHub Actions cron / `npm run check` | Alertas sin reservar |
| Detectar + reservar | `npm run bot` en Railway/Render/VM | Reserva semi-automática con OTP |

---

## Licencia

MIT — uso personal. Respeta los términos del sitio web del ministerio.
