#!/bin/sh
set -e

mkdir -p /app/data

echo "Application des migrations Prisma..."
node /app/prisma-migrate/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

chown -R nextjs:nodejs /app/data

echo "Démarrage de l'application sur le port ${PORT:-3000}..."
exec gosu nextjs node server.js
