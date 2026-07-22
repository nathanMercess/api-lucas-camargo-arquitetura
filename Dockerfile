# syntax=docker/dockerfile:1

FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive

COPY . .
RUN yarn build

FROM node:22-alpine

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080 \
  AUTH_MODE=iap \
  STORAGE_DRIVER=r2

WORKDIR /app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive --production && yarn cache clean

COPY --from=build --chown=node:node /app/dist/ ./dist/

EXPOSE 8080

USER node

CMD ["node", "dist/server.js"]
