FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public/
COPY src ./src/

ARG VITE_API_BASE_URL=/api
ARG VITE_SLIDE_DURATION_SEC=8
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SLIDE_DURATION_SEC=$VITE_SLIDE_DURATION_SEC

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
