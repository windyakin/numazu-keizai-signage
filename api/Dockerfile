FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

# prisma-client generator は src/generated に出力するため src を先に配置する
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/
COPY src ./src/
# generate は DB に接続しないが prisma.config.ts が DATABASE_URL を要求するためビルド時のみダミーを与える
# (実行時は compose の環境変数が使われる)
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

# Wait for postgres and run migrations, then start
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 3000
CMD ["./entrypoint.sh"]
