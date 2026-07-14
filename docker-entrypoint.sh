#!/bin/sh
set -e

mkdir -p /app/data

echo "Application des migrations Prisma..."
./node_modules/.bin/prisma migrate deploy

chown -R nextjs:nodejs /app/data

echo "Démarrage de l'application sur le port ${PORT:-3000}..."
exec gosu nextjs node server.js
