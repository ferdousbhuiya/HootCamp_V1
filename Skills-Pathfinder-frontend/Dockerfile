# ---- Frontend image: Vite build -> nginx static host + API proxy ----
# Topology B (recommended): browser calls same-origin /api/*, nginx proxies
# to the backend. VITE_API_URL is left EMPTY unless overridden at build.

# ---- Stage 1: build the SPA ----
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Runtime envs baked at build time. Coolify supplies these as build args.
# Keep VITE_API_URL empty for same-origin proxy; set to https://api.ferdouse.us to bypass nginx proxy.
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_SUPABASE_URL
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

RUN npm run build

# ---- Stage 2: serve with nginx ----
FROM nginx:1.27-alpine

# Coolify's Dockerfile healthcheck runner requires curl or wget in the image.
RUN apk add --no-cache curl

# Proxy target for /api/*. Coolify joins services on its default docker
# network; override at runtime if the backend lives on a different network.
ENV API_UPSTREAM=http://backend:8000

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine entrypoint envsubst-processes /etc/nginx/templates/*.template
# at container start, so API_UPSTREAM can be set per-resource in Coolify.
CMD ["nginx", "-g", "daemon off;"]
