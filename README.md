# ERP Builder Demo

Sistema di generazione automatica di applicazioni ERP utilizzando AI (Claude) per creare applicazioni Next.js complete e deployabili su Vercel.

## 🚀 Funzionalità

- **Generazione AI**: Crea applicazioni ERP complete usando prompt in linguaggio naturale
- **Validazione Automatica**: Sistema di auto-fix per correggere errori di sintassi nel codice generato
- **Deploy Automatico**: Integrazione con GitHub e Vercel per deploy automatico
- **Template Fallback**: Template predefiniti (Ordini, Magazzino, Clienti) se la generazione fallisce
- **Gestione App**: Visualizza, testa e gestisci tutte le applicazioni generate

## 📋 Prerequisiti

- Node.js 18+ e npm/yarn/pnpm
- Account Anthropic (per Claude API)
- Account GitHub (con token con permessi per creare repository)
- Account Vercel (con token API)
- Account Supabase (per il database)

## 🛠️ Setup Locale

### 1. Clona il repository

```bash
git clone <repository-url>
cd erp-builder-demo
```

### 2. Installa le dipendenze

```bash
npm install
# oppure
yarn install
# oppure
pnpm install
```

### 3. Configura le variabili d'ambiente

Copia il file `.env.example` in `.env.local`:

```bash
cp .env.example .env.local
```

Modifica `.env.local` con i tuoi valori reali:

```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
VERCEL_TOKEN=...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...  # Opzionale, usa SERVICE_ROLE_KEY se disponibile
SUPABASE_URL=https://xxxxx.supabase.co  # Opzionale, usa NEXT_PUBLIC_SUPABASE_URL se disponibile
```

### 4. Configura Supabase

Crea una tabella `generated_apps` in Supabase con questo schema:

```sql
CREATE TABLE generated_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  files JSONB NOT NULL,
  repoUrl TEXT,
  deployUrl TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. Avvia il server di sviluppo

```bash
npm run dev
# oppure
yarn dev
# oppure
pnpm dev
```

Apri [http://localhost:3000](http://localhost:3000) nel browser.

## 🚀 Deploy su Vercel

### 🎯 Deploy Automatico (Raccomandato)

Usa gli script automatici per deployare tutto in un click:

#### 1. Setup GitHub (prima volta)

```bash
npm run setup:github
```

Questo script:
- ✅ Verifica che `.env.local` sia configurato
- ✅ Crea automaticamente il repository GitHub
- ✅ Configura il remote Git
- ✅ Fa push del codice su GitHub

#### 2. Deploy su Vercel

```bash
npm run deploy
```

Questo script:
- ✅ Verifica tutti i prerequisiti
- ✅ Controlla le variabili d'ambiente
- ✅ Installa le dipendenze
- ✅ Fa build del progetto
- ✅ Deploya su Vercel usando Vercel CLI

**Nota**: Alla prima esecuzione, Vercel CLI ti chiederà di:
- Fare login (se non sei già loggato)
- Selezionare o creare un progetto
- Configurare le environment variables (puoi farlo anche dopo dal dashboard)

#### 3. Configura Environment Variables su Vercel

Dopo il primo deploy:
1. Vai su [vercel.com/dashboard](https://vercel.com/dashboard)
2. Seleziona il progetto deployato
3. Vai su **Settings > Environment Variables**
4. Aggiungi tutte le variabili da `.env.local`
5. Fai un nuovo deploy per applicare le variabili

---

### Opzione 2: Deploy manuale da GitHub

1. **Pusha il codice su GitHub**

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Connetti il repository a Vercel**

   - Vai su [vercel.com](https://vercel.com)
   - Clicca "Add New Project"
   - Seleziona il repository GitHub
   - Vercel rileverà automaticamente Next.js

3. **Configura le Environment Variables**

   Nelle impostazioni del progetto Vercel, aggiungi tutte le variabili d'ambiente da `.env.example`:
   - `ANTHROPIC_API_KEY`
   - `GITHUB_TOKEN`
   - `VERCEL_TOKEN`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_SERVICE_KEY` (opzionale)
   - `SUPABASE_URL` (opzionale)

4. **Deploy**

   Vercel deployerà automaticamente ad ogni push su `main`.

### Opzione 2: Deploy manuale con Vercel CLI

1. **Installa Vercel CLI**

```bash
npm i -g vercel
```

2. **Login**

```bash
vercel login
```

3. **Deploy**

```bash
vercel
```

Segui le istruzioni per configurare le environment variables.

## 📝 Script Disponibili

- `npm run dev` - Avvia il server di sviluppo
- `npm run build` - Build per produzione
- `npm run start` - Avvia il server di produzione (dopo il build)
- `npm run lint` - Esegue ESLint
- `npm run setup:github` - Setup automatico repository GitHub (prima volta)
- `npm run deploy` - Deploy automatico su Vercel

## 🔧 Configurazione

### GitHub Token

Il token GitHub deve avere questi permessi:
- `repo` (accesso completo ai repository)
- `delete_repo` (per cancellare repository)

Crea un token su: [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)

### Vercel Token

Crea un token su: [Vercel Settings > Tokens](https://vercel.com/account/tokens)

Il token deve avere permessi per:
- Creare progetti
- Creare deployment
- Cancellare progetti

### Supabase

1. Crea un nuovo progetto su [supabase.com](https://supabase.com)
2. Vai su Settings > API per ottenere:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (da Settings > API > service_role key)

## 🏗️ Architettura

- **Frontend**: Next.js 16 con App Router, React 19, Tailwind CSS, Framer Motion
- **Backend**: Next.js API Routes
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Database**: Supabase (PostgreSQL)
- **Deploy**: Vercel (automatico da GitHub)
- **Validazione**: esbuild per validazione sintassi TypeScript/TSX

## 📁 Struttura Progetto

```
erp-builder-demo/
├── app/
│   ├── api/
│   │   ├── generate/      # Generazione app con AI
│   │   ├── deploy/        # Deploy manuale
│   │   ├── apps/          # Gestione app
│   │   └── cleanup/       # Pulizia app e repository
│   ├── apps/              # Pagine per visualizzare app generate
│   └── page.tsx           # Home page
├── components/
│   ├── AIPromptBuilder.tsx  # Interfaccia generazione
│   └── AppsList.tsx         # Lista app generate
├── .env.example            # Template variabili d'ambiente
└── package.json
```

## 🔒 Sicurezza

- ⚠️ **NON committare** file `.env.local` o `.env` nel repository
- Usa sempre `.env.local` per sviluppo locale
- Configura le environment variables in Vercel per produzione
- I token GitHub e Vercel devono essere mantenuti segreti

## 🐛 Troubleshooting

### Errore: "ANTHROPIC_API_KEY non configurata"
- Verifica che `.env.local` esista e contenga `ANTHROPIC_API_KEY`
- Riavvia il server di sviluppo dopo aver modificato `.env.local`

### Errore: "GITHUB_TOKEN non configurato"
- Verifica che il token GitHub sia valido e abbia i permessi necessari
- Controlla che il token non sia scaduto

### Errore: "Tabella generated_apps non esiste"
- Esegui lo script SQL per creare la tabella in Supabase
- Verifica che `SUPABASE_SERVICE_ROLE_KEY` sia configurato correttamente

### Deployment su Vercel fallisce
- Verifica che tutte le environment variables siano configurate in Vercel
- Controlla i log di build su Vercel per errori specifici
- Assicurati che `esbuild` sia nelle `serverExternalPackages` in `next.config.ts`

## 📚 Risorse

- [Next.js Documentation](https://nextjs.org/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)

## 📄 Licenza

Questo progetto è privato e riservato.
