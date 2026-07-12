#!/bin/sh
set -e

mkdir -p /app/data
chown -R nextjs:nodejs /app/data

echo "Application des migrations Prisma..."
npx prisma migrate deploy

echo "Démarrage de l'application sur le port ${PORT:-3000}..."
exec su -s /bin/sh nextjs -c "exec node server.js"
