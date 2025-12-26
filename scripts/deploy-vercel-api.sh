#!/bin/bash

# Script di deploy automatico usando Vercel API direttamente
# Non richiede Vercel CLI o interazione

set -e

echo "🚀 ERP Builder Demo - Deploy Automatico via Vercel API"
echo "========================================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Carica variabili d'ambiente
if [ ! -f ".env.local" ]; then
    echo -e "${RED}❌ .env.local non trovato${NC}"
    exit 1
fi

# Carica tutte le variabili d'ambiente da .env.local
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

# Carica VERCEL_TOKEN (usa quello fornito o quello da .env.local)
VERCEL_TOKEN="${VERCEL_TOKEN:-$(grep "^VERCEL_TOKEN=" .env.local 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)}"

# Usa il token fornito dall'utente se disponibile come argomento
if [ ! -z "$1" ]; then
    VERCEL_TOKEN="$1"
fi

# Se ancora non c'è, prova a leggere da variabile d'ambiente
if [ -z "$VERCEL_TOKEN" ] || [ "$VERCEL_TOKEN" = "your_vercel_token_here" ]; then
    VERCEL_TOKEN="${VERCEL_TOKEN_ENV:-}"
fi

if [ -z "$VERCEL_TOKEN" ] || [ "$VERCEL_TOKEN" = "your_vercel_token_here" ]; then
    echo -e "${RED}❌ VERCEL_TOKEN non configurato${NC}"
    exit 1
fi

# Carica altre variabili necessarie
GITHUB_TOKEN="${GITHUB_TOKEN:-$(grep "^GITHUB_TOKEN=" .env.local 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)}"
REPO_NAME="erp-builder-demo"
GITHUB_USERNAME="gpotenza80"

echo -e "${GREEN}✅ Token Vercel trovato${NC}"
echo ""

# Verifica se il progetto esiste già
echo "🔍 Verifica progetto esistente..."
PROJECT_RESPONSE=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v9/projects/$REPO_NAME")

if echo "$PROJECT_RESPONSE" | grep -q '"id"'; then
    echo -e "${YELLOW}⚠️  Progetto già esistente: $REPO_NAME${NC}"
    PROJECT_ID=$(echo "$PROJECT_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Project ID: $PROJECT_ID${NC}"
else
    echo "📦 Creazione nuovo progetto Vercel..."
    
    # Ottieni repoId da GitHub
    echo "🔍 Ottenimento repoId da GitHub..."
    GITHUB_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$REPO_NAME")
    
    # Estrai l'ID (può essere "id": 123 o "id":123)
    REPO_ID=$(echo "$GITHUB_RESPONSE" | grep -oE '"id"[[:space:]]*:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')
    
    if [ -z "$REPO_ID" ]; then
        echo -e "${RED}❌ Impossibile ottenere repoId da GitHub${NC}"
        echo "Risposta API: ${GITHUB_RESPONSE:0:200}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Repo ID: $REPO_ID${NC}"
    
    # Crea progetto Vercel
    CREATE_RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        -H "Content-Type: application/json" \
        "https://api.vercel.com/v9/projects" \
        -d "{
            \"name\": \"$REPO_NAME\",
            \"framework\": \"nextjs\",
            \"gitRepository\": {
                \"type\": \"github\",
                \"repo\": \"$GITHUB_USERNAME/$REPO_NAME\",
                \"repoId\": $REPO_ID
            }
        }")
    
    if echo "$CREATE_RESPONSE" | grep -q '"id"'; then
        PROJECT_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
        echo -e "${GREEN}✅ Progetto creato: $PROJECT_ID${NC}"
    else
        echo -e "${RED}❌ Errore durante la creazione del progetto${NC}"
        echo "$CREATE_RESPONSE"
        exit 1
    fi
fi

# Carica tutte le variabili d'ambiente da .env.local
echo ""
echo "🔧 Configurazione environment variables..."

# Lista delle variabili da configurare
ENV_VARS=(
    "ANTHROPIC_API_KEY"
    "GITHUB_TOKEN"
    "VERCEL_TOKEN"
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "SUPABASE_SERVICE_KEY"
    "SUPABASE_URL"
)

for VAR_NAME in "${ENV_VARS[@]}"; do
    VAR_VALUE=$(grep "^$VAR_NAME=" .env.local 2>/dev/null | cut -d '=' -f2- | tr -d '"' | tr -d "'" | xargs)
    
    if [ -z "$VAR_VALUE" ] || [[ "$VAR_VALUE" == *"your_"* ]]; then
        echo -e "${YELLOW}⚠️  $VAR_NAME non configurato, saltato${NC}"
        continue
    fi
    
    # Verifica se la variabile esiste già
    EXISTING_VARS=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v9/projects/$PROJECT_ID/env")
    
    VAR_EXISTS=$(echo "$EXISTING_VARS" | grep -o "\"key\":\"$VAR_NAME\"" || true)
    
    if [ ! -z "$VAR_EXISTS" ]; then
        echo -e "${YELLOW}⚠️  $VAR_NAME già esistente, aggiornamento...${NC}"
        # Ottieni l'ID della variabile esistente
        ENV_ID=$(echo "$EXISTING_VARS" | grep -A 5 "\"key\":\"$VAR_NAME\"" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -1)
        
        # Aggiorna la variabile
        UPDATE_RESPONSE=$(curl -s -X PATCH \
            -H "Authorization: Bearer $VERCEL_TOKEN" \
            -H "Content-Type: application/json" \
            "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$ENV_ID" \
            -d "{
                \"value\": \"$VAR_VALUE\",
                \"type\": \"plain\",
                \"target\": [\"production\", \"preview\", \"development\"]
            }")
    else
        # Crea nuova variabile
        CREATE_ENV_RESPONSE=$(curl -s -X POST \
            -H "Authorization: Bearer $VERCEL_TOKEN" \
            -H "Content-Type: application/json" \
            "https://api.vercel.com/v9/projects/$PROJECT_ID/env" \
            -d "{
                \"key\": \"$VAR_NAME\",
                \"value\": \"$VAR_VALUE\",
                \"type\": \"plain\",
                \"target\": [\"production\", \"preview\", \"development\"]
            }")
        
        if echo "$CREATE_ENV_RESPONSE" | grep -q '"id"'; then
            echo -e "${GREEN}✅ $VAR_NAME configurata${NC}"
        else
            echo -e "${YELLOW}⚠️  Errore configurazione $VAR_NAME (potrebbe già esistere)${NC}"
        fi
    fi
done

# Triggera deployment
echo ""
echo "🚀 Trigger deployment..."

# Ottieni repoId se non l'abbiamo già (per il deployment)
if [ -z "$REPO_ID" ]; then
    echo "🔍 Ottenimento repoId per deployment..."
    GITHUB_RESPONSE=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$REPO_NAME")
    REPO_ID=$(echo "$GITHUB_RESPONSE" | grep -oE '"id"[[:space:]]*:[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')
fi

DEPLOY_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.vercel.com/v13/deployments" \
    -d "{
        \"name\": \"$REPO_NAME\",
        \"project\": \"$PROJECT_ID\",
        \"target\": \"production\",
        \"gitSource\": {
            \"type\": \"github\",
            \"repoId\": $REPO_ID,
            \"ref\": \"main\"
        }
    }")

if echo "$DEPLOY_RESPONSE" | grep -q '"id"'; then
    DEPLOYMENT_ID=$(echo "$DEPLOY_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4 | head -1)
    DEPLOYMENT_URL=$(echo "$DEPLOY_RESPONSE" | grep -o '"url":"[^"]*' | cut -d'"' -f4 | head -1)
    
    echo -e "${GREEN}✅ Deployment triggerato!${NC}"
    echo -e "${GREEN}   Deployment ID: $DEPLOYMENT_ID${NC}"
    echo -e "${GREEN}   URL: https://$DEPLOYMENT_URL${NC}"
    echo ""
    echo "📝 Monitora il deployment su:"
    echo "   https://vercel.com/$GITHUB_USERNAME/$REPO_NAME"
    echo ""
    echo "🌐 URL applicazione:"
    echo "   https://$REPO_NAME.vercel.app"
else
    echo -e "${RED}❌ Errore durante il deployment${NC}"
    echo "$DEPLOY_RESPONSE"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Deploy completato con successo!${NC}"

