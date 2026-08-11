#!/bin/bash
cd "$(dirname "$0")"
export DATABASE_URL="file:$(pwd)/prisma/dev.db"
export NEXTAUTH_SECRET="mi6-classified-secret-key-change-in-production"
export NEXTAUTH_URL="http://localhost:3001"
exec /Users/louisdestrebecq/Websites/node_modules/.bin/next dev --webpack --port 3001
