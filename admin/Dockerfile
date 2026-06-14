FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src/

ARG VITE_API_BASE_URL=/api/admin
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# 起動時に envsubst で展開され /etc/nginx/conf.d/default.conf が生成される
COPY default.conf.template /etc/nginx/templates/default.conf.template

# proxy_pass の宛先。compose では api サービス名、別構成なら上書きする
ENV API_UPSTREAM=http://api:3000

EXPOSE 80
