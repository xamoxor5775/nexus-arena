# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV NITRO_PRESET=node-server

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run typecheck
RUN npm run build
# Nitro bundles PGlite into the server; keep its WASM/data assets beside the
# generated chunk so the Node runtime can initialise the persistent database.
RUN cp node_modules/@electric-sql/pglite/dist/pglite.data \
      node_modules/@electric-sql/pglite/dist/pglite.wasm \
      node_modules/@electric-sql/pglite/dist/initdb.wasm \
      .output/server/_libs/

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    PGLITE_DATA_DIR=/app/data

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/data && chown -R node:node /app/data

EXPOSE 8080

USER node
CMD ["npm", "start"]
