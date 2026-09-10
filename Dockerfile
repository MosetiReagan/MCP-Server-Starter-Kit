FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages ./packages
COPY examples ./examples
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/packages/core/package.json ./packages/core/package.json
COPY --from=build --chown=app:app /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=app:app /app/packages/server/package.json ./packages/server/package.json
COPY --from=build --chown=app:app /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=app:app /app/packages/integrations/package.json ./packages/integrations/package.json
COPY --from=build --chown=app:app /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=build --chown=app:app /app/examples/complete/package.json ./examples/complete/package.json
COPY --from=build --chown=app:app /app/examples/complete/dist ./examples/complete/dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "examples/complete/dist/index.js"]
