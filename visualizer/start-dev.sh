#!/bin/bash
# Load environment variables from .env.local manually
# This is a workaround for Next.js 16/Turbopack not loading .env.local properly
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi
npm run dev
