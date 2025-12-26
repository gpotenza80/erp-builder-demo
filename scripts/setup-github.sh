#!/bin/bash

# Script per configurare GitHub automaticamente
# Questo script crea il repository GitHub e fa il push iniziale

set -e

echo "🐙 GitHub Setup Script"
echo "======================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verifica se .env.local esiste e carica GITHUB_TOKEN
if [ ! -f ".env.local" ]; then
    echo -e "${RED}❌ .env.local non trovato${NC}"
    exit 1
fi

# Carica GITHUB_TOKEN da .env.local (gestisce spazi, quote, etc.)
GITHUB_TOKEN=$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)

if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "your_github_token_here" ]; then
    echo -e "${RED}❌ GITHUB_TOKEN non configurato in .env.local${NC}"
    exit 1
fi

export GITHUB_TOKEN

# Verifica se git è inizializzato
if [ ! -d ".git" ]; then
    echo "📦 Inizializzazione repository Git..."
    git init
    git branch -M main
fi

# Verifica se c'è già un remote
if git remote get-url origin >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Remote GitHub già configurato${NC}"
    REMOTE_URL=$(git remote get-url origin)
    echo "   URL: $REMOTE_URL"
else
    # Ottieni username GitHub usando l'API
    echo "🔍 Ottenimento username GitHub..."
    GITHUB_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user)
    USERNAME=$(echo "$GITHUB_RESPONSE" | grep -o '"login"[[:space:]]*:[[:space:]]*"[^"]*' | grep -o '[^"]*$')
    
    if [ -z "$USERNAME" ]; then
        echo -e "${RED}❌ Impossibile ottenere username GitHub. Verifica il token.${NC}"
        echo "Risposta API: ${GITHUB_RESPONSE:0:200}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Username GitHub: $USERNAME${NC}"
    
    # Nome repository (usa il nome della directory)
    REPO_NAME=$(basename "$PWD")
    
    echo ""
    echo "📝 Nome repository: $REPO_NAME"
    # Usa il nome di default senza chiedere input
    
    # Crea repository GitHub
    echo ""
    echo "📦 Creazione repository GitHub..."
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        https://api.github.com/user/repos \
        -d "{\"name\":\"$REPO_NAME\",\"private\":false,\"auto_init\":false}")
    
    # Verifica se il repository esiste già
    if echo "$RESPONSE" | grep -q "already exists"; then
        echo -e "${YELLOW}⚠️  Repository già esistente${NC}"
    elif echo "$RESPONSE" | grep -q "Bad credentials"; then
        echo -e "${RED}❌ Token GitHub non valido${NC}"
        exit 1
    elif echo "$RESPONSE" | grep -q '"id"'; then
        echo -e "${GREEN}✅ Repository creato: $USERNAME/$REPO_NAME${NC}"
    else
        echo -e "${RED}❌ Errore durante la creazione del repository${NC}"
        echo "$RESPONSE"
        exit 1
    fi
    
    # Aggiungi remote
    echo ""
    echo "🔗 Configurazione remote..."
    git remote add origin "https://$GITHUB_TOKEN@github.com/$USERNAME/$REPO_NAME.git"
    echo -e "${GREEN}✅ Remote configurato${NC}"
fi

# Aggiungi tutti i file
echo ""
echo "📝 Aggiunta file al repository..."
git add .

# Commit
if git diff --staged --quiet; then
    echo -e "${YELLOW}⚠️  Nessuna modifica da committare${NC}"
else
    echo "💾 Commit modifiche..."
    git commit -m "Initial commit: ERP Builder Demo ready for Vercel deployment" || true
fi

# Push
echo ""
echo "🚀 Push su GitHub..."
git push -u origin main || git push -u origin main --force

echo ""
echo -e "${GREEN}✅ Repository GitHub configurato e aggiornato!${NC}"
echo ""
echo "🔗 URL repository: https://github.com/$USERNAME/$REPO_NAME"
echo ""
echo "📝 Prossimi passi:"
echo "  1. Vai su https://vercel.com"
echo "  2. Clicca 'Add New Project'"
echo "  3. Seleziona il repository $USERNAME/$REPO_NAME"
echo "  4. Configura le environment variables"
echo "  5. Deploy!"

