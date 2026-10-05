# PWA + API en un solo contenedor. Los datos (SQLite) van en /data: montar un volumen ahí.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
# Solo si la API vive en otro dominio: --build-arg VITE_API_URL=https://api.tudominio.com/api
ARG VITE_API_URL
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production PORT=3001 DB_PATH=/data/flujo.db
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/src ./server/src
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3001
WORKDIR /app/server
CMD ["node", "src/index.js"]
