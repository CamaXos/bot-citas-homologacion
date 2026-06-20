# Programar comprobaciones cada 15 min (alternativa fiable)

El cron de GitHub Actions (`schedule`) **puede tardar horas en activarse** en repos nuevos y **no garantiza** la hora exacta. Si no ves ejecuciones automáticas, usa este método gratuito con [cron-job.org](https://cron-job.org).

## Requisitos

1. Repo en GitHub con el workflow `.github/workflows/check-citas.yml` en la rama `main`.
2. Un **Personal Access Token (PAT)** de GitHub con permiso `repo` (solo para repos privados; en público basta `public_repo` o `repo`).

### Crear el token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.
2. **Generate new token (classic)**.
3. Marca el scope **`repo`** (o **`public_repo`** si el repo es público).
4. Copia el token (`ghp_...`). Guárdalo en un sitio seguro; no lo subas al repo.

## Configurar cron-job.org (gratis)

1. Regístrate en [https://cron-job.org](https://cron-job.org).
2. **Cronjobs** → **Create cronjob**.
3. Rellena:

| Campo | Valor |
|-------|-------|
| **Title** | `Bot citas homologación` |
| **URL** | `https://api.github.com/repos/CamaXos/bot-citas-homologacion/dispatches` |
| **Schedule** | Every 15 minutes (o el intervalo que quieras) |
| **Request method** | `POST` |

4. En **Headers** (cabeceras), añade:

| Header | Valor |
|--------|-------|
| `Accept` | `application/vnd.github+json` |
| `Authorization` | `Bearer ghp_TU_TOKEN_AQUI` |
| `Content-Type` | `application/json` |

5. En **Request body** (cuerpo):

```json
{"event_type":"check-citas"}
```

6. Guarda y activa el cronjob.

## Comprobar que funciona

1. En cron-job.org, pulsa **Run now** en el cronjob.
2. En GitHub: **Actions** → **Comprobar citas homologación**.
3. Debe aparecer una ejecución con evento **`repository_dispatch`**.

## Alternativa: disparar con GitHub CLI

Si ya tienes `gh` autenticado:

```bash
gh api repos/CamaXos/bot-citas-homologacion/dispatches \
  -f event_type=check-citas
```

## Notas

- El cron interno de GitHub sigue activo como respaldo; cuando empiece a funcionar verás ejecuciones con evento **`schedule`**.
- Si cambias el nombre del repo, actualiza la URL del cronjob.
- Revoca el PAT en GitHub si dejas de usar cron-job.org.
