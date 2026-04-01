#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until nc -z postgres 5432 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

echo "Running migrations..."
npx prisma migrate deploy

echo "Starting API server..."
exec npx tsx src/index.ts
