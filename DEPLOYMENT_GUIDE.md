# Skills Pathfinder — Deploy to Hetzner + Coolify (ferdouse.us)

Full migration off Vercel + hosted Supabase to your own VPS. Target: **frontend `ferdouse.us`**, **backend at `api.ferdouse.us`** (or proxied same-origin — see Topology), **self-hosted Supabase** for auth + Postgres with RLS.

> **Prereqs you must have before starting:** Hetzner VPS with SSH root access; domain `ferdouse.us` control (registrar/DNS); GitHub repo access; SMTP credentials (Gmail app password / Brevo / Resend / SendGrid) for email verification — the app requires confirmed emails for signup.

---

## 0. Pre-flight: check VPS can run the stack

Full self-hosted Supabase is RAM-hungry. SSH in and confirm capacity:

```bash
ssh root@<your-vps-ip>
free -h        # want >= 8GB total
nproc          # >= 2 cores nice-to-have
df -h /        # want >= 20GB free
```

- **If < 8GB RAM:** enable swap first (`fallocate -l 8G /swapfile; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile`; add to `/etc/fstab`). Hetzner CX42 (8GB) or larger recommended.
- If your VPS is tiny or you only want to preview, you can run the *backend first* and add Supabase after — but auth needs the DB, so plan for the full stack.

---

## 1. DNS records

At your registrar, add **A records** pointing at the VPS public IP:

| Name | Type | Value |
|------|------|-------|
| `ferdouse.us` | A | `<VPS-IP>` |
| `www.ferdouse.us` | A | `<VPS-IP>` |
| `api.ferdouse.us` | A | `<VPS-IP>` |
| `supabase.ferdouse.us` (optional) | A | `<VPS-IP>` — only if you want the DB API reachable by domain; the app talks to it internally instead |

Wait for DNS propagation (minutes to a few hours).

---

## 2. Install Coolify

```bash
curl -fsSL https://install.getcoolify.sh | bash
```

- Result prints your Coolify URL + admin creds. Log in, go to **Settings → Server → Domain**, set Coolify itself to `https://coolify.ferdouse.us`.
- (Optional) Settings → Security: force 2FA for your admin login.

---

## 3. Connect your GitHub repo in Coolify

1. **Sources** → **Add GitHub App**, authorise so Coolify can read your repo.
2. Coolify will clone the monorepo. From this repo it builds **three resources**:
   - Backend: uses `skills-pathfinder-backend/Dockerfile`
   - Frontend: uses `Skills-Pathfinder-frontend/Dockerfile`
   - Supabase: the built-in Supabase template (preferred) — see step 4.

---

## 4. Deploy self-hosted Supabase

**Preferred — Coolify's built-in Supabase template:**
Coolify → **New Resource → Supabase**. It provisions Postgres + GoTrue + PostgREST + Kong/Storage for you. Configure:

- JWT secret: `openssl rand -base64 64 | tr -d '/+=' | head -c 32`
- Postgres password: `openssl rand -base64 24 | tr -d '/+=' | head -c 32`
- anon + service_role keys **derived from that JWT secret**. Coolify generates them; or use the helper in the Supabase docs. **Store `service_role` only in the backend env — never in the browser.**
- **SMTP block** (required — email verification on): host/port/user/pass/sender per your provider. `SITE_URL=https://ferdouse.us`, `ADDITIONAL_REDIRECT_URLS=https://ferdouse.us,http://localhost:5173`.

**Fallback — compose:** if not using the template, put `supabase/env.example` values into `supabase/.env`, add `docker-compose.supabase.yml` + `supabase/kong.yml` as a **Docker Compose** resource in Coolify, and start. (The compose omits the Storage service — add `supabase/storage` + MinIO containers later when cert file upload lands.)

### 4a. Apply the schema

Open Supabase SQL Editor (Coolify Supabase resource → "SQL" or `psql` into the container) and run the whole of **`supabase/migration.sql`**. It creates tables + RLS + the new-user profile trigger, matching exactly what the frontend reads/writes (verified against the code). If you run it twice, the `DROP ... IF EXISTS` guards make it idempotent.

---

## 5. Deploy backend

Coolify → **New Resource → Dockerfile**, pointing at `skills-pathfinder-backend` (base path = repo subfolder, Dockerfile path = `skills-pathfinder-backend/Dockerfile`).

**Domain:** `api.ferdouse.us`. Enable HTTPS (Coolify/Traefik will issue Let's Encrypt + renew — pick the proxy of your choice, then turn on auto-HTTPS).

**Environment variables:**

```
GROQ_API_KEY=<your real groq key>
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_URL=<internal supabase endpoint, e.g. http://kong:8000>
SUPABASE_KEY=<service_role key — server only>
ALLOWED_ORIGINS=https://ferdouse.us,https://www.ferdouse.us,http://localhost:5173
```

**Networking:** ensure backend + frontend containers share a Coolify network so the frontend nginx can reach the backend by name (step 6).

---

## 6. Deploy frontend

Coolify → **New Resource → Dockerfile**, pointing at `Skills-Pathfinder-frontend`, Dockerfile path `Skills-Pathfinder-frontend/Dockerfile`.

**Domain:** `ferdouse.us` (and `www.ferdouse.us`). HTTPS on.

**Build arguments** (these get baked into the SPA at build):

| Arg | Value (topology B — recommended) |
|-----|------|
| `VITE_API_URL` | **(leave empty)** → browser calls `/api/*` same-origin; nginx proxies to backend |
| `VITE_SUPABASE_URL` | the public Supabase API url the browser can reach, e.g. `https://supabase.ferdouse.us` (or `http://kong:8000` if exposed) |
| `VITE_SUPABASE_ANON_KEY` | the **anon** key (public by design; RLS guards the tables) |

**Runtime env:** `API_UPSTREAM=<backend-url>`, e.g. `http://backend:8000` (backend container name on the shared Coolify network).

> **Topology A (alternative):** set `VITE_API_URL=https://api.ferdouse.us` and rely on CORS — the nginx `/api/` proxy is then unused. This is the config you'd keep only if you want API on a separate subdomain.

---

## 7. Smoke test end-to-end

1. `curl https://api.ferdouse.us/` → `{"status":"Skills Pathfinder API is online."}`
2. `curl https://ferdouse.us/` → the app's `index.html`.
3. In browser, sign up at `https://ferdouse.us` → **receive confirmation email** → confirm → sign in.
4. New-user onboarding: upload a sample resume (`I know Python, SQL, and data analysis`), add a cert + course → Finish. Skills appear on dashboard.
5. Resume upload → career report → **Download PDF** (html2pdf runs client-side).
6. Certificate verify: send a sample cert image to `/api/verify-certificate`:
   `curl -F "file=@cert.png" https://api.ferdouse.us/api/verify-certificate`
7. Confirm RLS: logged-out browser hitting a table returns `{}` / no rows.

---

## 8. Cut over from Vercel + hosted Supabase

1. Point users at `https://ferdouse.us` (DNS already moved).
2. **Database:** two options —
   - **Fresh start:** simplest. The self-hosted DB starts empty; existing users re-signup (new emails). Old hosted Supabase rows can stay archived or be dropped.
   - **Migrate old data:** `pg_dump` the hosted Supabase DB (via its dashboard "Database backups" or `pg_dump --schema-only` for structure + data for the 5 tables), then restore into the self-hosted container. **`auth.users` carries hashed passwords** so logins keep working, but expect your hosted anon/service keys to differ — flip the backend `.env`; keep confirmation/verification state or re-verify.
3. Once `ferdouse.us` is verified working, tear down the Vercel deployment and the hosted Supabase project.

---

## 9. Maintenance / security checklist

- **Backups:** hosted Supabase had managed backups; **self-hosted has none by default**. Set a nightly `pg_dump` cron on the VPS (see the official Supabase backup guide) and test a restore.
- **Secret hygiene:** `.env` files and `test_groq.py` hold live keys — they're gitignored, but delete the plaintext key in `test_groq.py` before any public push. `SERVICE_ROLE_KEY` must never appear in the frontend bundle (`VITE_*` vars are public).
- **TLS:** keep HTTPS enforced; Let's Encrypt auto-renew must run (Coolify schedules it).
- **Updates:** update Coolify + the container images on a schedule; test in a staging resource first.
- **Watch RAM** on the VPS (`docker stats`). On a 8GB box consider `swap` already added in step 0.
- **Caddy/Traefik note:** Coolify picks the proxy; set it once in step 5 and reuse for frontend + Supabase domains. Keep one proxy so certs are centrally renewed.

---

## Files this repo adds that make this work

| File | Purpose |
|------|---------|
| `skills-pathfinder-backend/Dockerfile` / `.dockerignore` | container build for the FastAPI backend (incl. Tesseract OCR) |
| `Skills-Pathfinder-frontend/Dockerfile` / `.dockerignore` / `nginx.conf.template` | multi-stage build + nginx serving SPA and proxying `/api/*` |
| `supabase/migration.sql` | full schema + RLS + profile trigger |
| `supabase/env.example` | self-host Supabase key/SMTP template |
| `supabase/kong.yml` | Kong declarative config (fallback compose) |
| `docker-compose.supabase.yml` | fallback compose for self-hosted Supabase |
| `.env.example` | cross-app env template (placeholders only) |
| `main.py` (edited) | CORS from env, no import-time DB call, no key in logs, Tesseract path from env |