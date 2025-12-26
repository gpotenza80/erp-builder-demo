#!/bin/bash

# Script per configurare il deploy automatico completo

set -e

echo "🔧 Configurazione Deploy Automatico"
echo "===================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verifica che siamo in un repository git
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Questo non è un repository Git${NC}"
    exit 1
fi

# Crea il git hook per auto-push
echo "📝 Creazione git hook per auto-push..."

cat > .git/hooks/post-commit << 'HOOK_EOF'
#!/bin/bash

# Git hook per deploy automatico dopo ogni commit
# Questo hook viene eseguito automaticamente dopo ogni commit

# Carica variabili d'ambiente se .env.local esiste
if [ -f ".env.local" ]; then
    export $(grep -v '^#' .env.local | grep -v '^$' | xargs)
fi

# Verifica se VERCEL_TOKEN è configurato
if [ -z "$VERCEL_TOKEN" ] || [ "$VERCEL_TOKEN" = "your_vercel_token_here" ]; then
    # Se non c'è il token, esci silenziosamente (non bloccare il commit)
    exit 0
fi

# Verifica se siamo sul branch main
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    # Deploy solo da main
    exit 0
fi

# Push automatico su GitHub (questo triggera Vercel)
echo ""
echo "🚀 Auto-push su GitHub (triggera deploy Vercel automatico)..."
git push origin main > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Push completato! Vercel deployerà automaticamente."
else
    echo "⚠️  Push fallito (potrebbe essere già aggiornato)"
fi
HOOK_EOF

chmod +x .git/hooks/post-commit

echo -e "${GREEN}✅ Git hook configurato${NC}"
echo ""
echo "📝 Come funziona:"
echo "   1. Fai modifiche ai file"
echo "   2. Fai commit: git commit -m 'messaggio'"
echo "   3. Il hook fa automaticamente push su GitHub"
echo "   4. Vercel rileva il push e deploya automaticamente"
echo ""
echo -e "${GREEN}✅ Deploy automatico configurato!${NC}"
echo ""
echo "💡 Per disabilitare temporaneamente:"
echo "   chmod -x .git/hooks/post-commit"
echo ""
echo "💡 Per riabilitare:"
echo "   chmod +x .git/hooks/post-commit"

