#!/bin/bash

# Script di deploy automatico per Vercel
# Questo script automatizza il processo di deploy

set -e  # Exit on error

echo "🚀 ERP Builder Demo - Deploy Script"
echo "===================================="
echo ""

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Funzione per verificare se un comando esiste
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verifica prerequisiti
echo "📋 Verifica prerequisiti..."

if ! command_exists node; then
    echo -e "${RED}❌ Node.js non trovato. Installa Node.js 18+ prima di continuare.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js trovato: $(node --version)${NC}"

if ! command_exists npm; then
    echo -e "${RED}❌ npm non trovato.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ npm trovato: $(npm --version)${NC}"

# Verifica se .env.local esiste
if [ ! -f ".env.local" ]; then
    echo -e "${YELLOW}⚠️  .env.local non trovato${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}📝 Creazione .env.local da .env.example...${NC}"
        cp .env.example .env.local
        echo -e "${YELLOW}⚠️  IMPORTANTE: Modifica .env.local con i tuoi valori reali prima di continuare!${NC}"
        echo ""
        read -p "Premi ENTER dopo aver configurato .env.local..."
    else
        echo -e "${RED}❌ .env.example non trovato. Crea manualmente .env.local${NC}"
        exit 1
    fi
fi

# Verifica variabili d'ambiente critiche
echo ""
echo "🔍 Verifica variabili d'ambiente..."

source .env.local 2>/dev/null || true

MISSING_VARS=()

if [ -z "$ANTHROPIC_API_KEY" ] || [ "$ANTHROPIC_API_KEY" = "your_anthropic_api_key_here" ]; then
    MISSING_VARS+=("ANTHROPIC_API_KEY")
fi

if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "your_github_token_here" ]; then
    MISSING_VARS+=("GITHUB_TOKEN")
fi

if [ -z "$VERCEL_TOKEN" ] || [ "$VERCEL_TOKEN" = "your_vercel_token_here" ]; then
    MISSING_VARS+=("VERCEL_TOKEN")
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ "$NEXT_PUBLIC_SUPABASE_URL" = "your_supabase_url_here" ]; then
    MISSING_VARS+=("NEXT_PUBLIC_SUPABASE_URL")
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || [ "$NEXT_PUBLIC_SUPABASE_ANON_KEY" = "your_supabase_anon_key_here" ]; then
    MISSING_VARS+=("NEXT_PUBLIC_SUPABASE_ANON_KEY")
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] || [ "$SUPABASE_SERVICE_ROLE_KEY" = "your_supabase_service_role_key_here" ]; then
    MISSING_VARS+=("SUPABASE_SERVICE_ROLE_KEY")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}❌ Variabili d'ambiente mancanti o non configurate:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "   ${RED}- $var${NC}"
    done
    echo ""
    echo -e "${YELLOW}Modifica .env.local e riprova.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Tutte le variabili d'ambiente sono configurate${NC}"

# Installa dipendenze se necessario
echo ""
echo "📦 Verifica dipendenze..."

if [ ! -d "node_modules" ]; then
    echo "📥 Installazione dipendenze..."
    npm install
else
    echo -e "${GREEN}✅ Dipendenze già installate${NC}"
fi

# Build del progetto
echo ""
echo "🔨 Build del progetto..."

npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build completato con successo${NC}"
else
    echo -e "${RED}❌ Build fallito. Controlla gli errori sopra.${NC}"
    exit 1
fi

# Verifica se Vercel CLI è installato
echo ""
if ! command_exists vercel; then
    echo -e "${YELLOW}⚠️  Vercel CLI non trovato${NC}"
    echo "📥 Installazione Vercel CLI..."
    npm install -g vercel
fi

# Deploy su Vercel
echo ""
echo "🚀 Deploy su Vercel..."
echo ""
echo -e "${YELLOW}Nota: Se è la prima volta, verrai chiesto di:${NC}"
echo -e "${YELLOW}  1. Fare login su Vercel${NC}"
echo -e "${YELLOW}  2. Selezionare il progetto o crearne uno nuovo${NC}"
echo -e "${YELLOW}  3. Configurare le environment variables${NC}"
echo ""

read -p "Premi ENTER per continuare con il deploy..."

vercel --prod

echo ""
echo -e "${GREEN}✅ Deploy completato!${NC}"
echo ""
echo "📝 Prossimi passi:"
echo "  1. Vai su https://vercel.com/dashboard"
echo "  2. Seleziona il progetto deployato"
echo "  3. Vai su Settings > Environment Variables"
echo "  4. Aggiungi tutte le variabili da .env.local"
echo "  5. Fai un nuovo deploy per applicare le variabili"

