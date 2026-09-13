# DIANA — núcleo de background. Imagem multi-stage compatível com
# OCI Container Instances (base node:22-slim).
#
# Modos de execução (ver docs/analise-tecnica-fase1.md §2.5):
#   --once  (recomendado): roda 1 batch e sai; OCI Resource Scheduler dispara a cada 2h.
#   daemon  (fallback):    processo contínuo com cron interno de 2h.

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app

# Instala dependências (inclui devDeps para compilar com tsc).
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Compila TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove devDeps, mantendo apenas dependências de produção.
RUN npm prune --omit=dev

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Usuário não-root.
USER node

# Por padrão roda 1 batch e sai (compatível com Resource Scheduler).
ENTRYPOINT ["node", "dist/main.js"]
CMD ["--once"]
