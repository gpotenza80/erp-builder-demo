#!/bin/bash

# Script completamente automatico per setup e deploy
# Esegue tutto in sequenza senza interazione

set -e

echo "🚀 ERP Builder Demo - Deploy Completamente Automatico"
echo "======================================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verifica che .env.local esista
if [ ! -f ".env.local" ]; then
    echo -e "${RED}❌ .env.local non trovato${NC}"
    echo "Copia .env.example in .env.local e configura le variabili d'ambiente"
    exit 1
fi

# Step 1: Setup GitHub (se necessario)
echo "📦 Step 1: Setup GitHub..."
if git remote get-url origin >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Repository GitHub già configurato${NC}"
else
    echo "🔧 Configurazione repository GitHub..."
    npm run setup:github
fi

# Step 2: Build locale per verificare errori
echo ""
echo "🔨 Step 2: Build locale (verifica errori)..."
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Build locale completato con successo${NC}"
else
    echo -e "${RED}❌ Build locale fallito. Correggi gli errori prima di deployare.${NC}"
    npm run build
    exit 1
fi

# Step 3: Commit e push automatico (se ci sono modifiche)
echo ""
echo "📝 Step 3: Commit e push modifiche..."
if [ -n "$(git status --porcelain)" ]; then
    echo "📦 Trovate modifiche non committate..."
    git add -A
    git commit -m "Auto-commit: preparazione deploy $(date +%Y-%m-%d_%H:%M:%S)" || true
    git push origin main || true
    echo -e "${GREEN}✅ Modifiche committate e pushato${NC}"
else
    echo -e "${GREEN}✅ Nessuna modifica da committare${NC}"
fi

# Step 4: Deploy su Vercel
echo ""
echo "🚀 Step 4: Deploy su Vercel..."
npm run deploy:vercel

echo ""
echo -e "${GREEN}✅ Deploy completamente automatico completato!${NC}"
echo ""
echo "🌐 La tua applicazione sarà disponibile a breve su:"
echo "   https://erp-builder-demo.vercel.app"

