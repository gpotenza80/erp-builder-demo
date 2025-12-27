import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { parseClaudeResponse, validateAndFixCode, getBaseFiles, getSafeTemplate } from '@/lib/code-generation';
import { createAndPushGitHubRepo, createVercelDeployment, getGitHubClient, withRetry } from '@/lib/github-deploy';

// Inizializza Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  console.log('[SUPABASE] URL:', supabaseUrl ? 'trovato' : 'MANCANTE');
  console.log('[SUPABASE] KEY:', supabaseKey ? 'trovato' : 'MANCANTE');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials non configurate');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Crea la tabella se non esiste
async function ensureTableExists(supabase: any) {
  // Prova a creare la tabella con tutte le colonne necessarie (ignora se esiste già)
  const { error: createError } = await (supabase as any).rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS generated_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt TEXT NOT NULL,
        files JSONB NOT NULL,
        repoUrl TEXT,
        deployUrl TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });

  // Aggiungi colonne deployUrl e repoUrl se non esistono (per tabelle create prima)
  // Questo funziona solo se la funzione RPC exec_sql è disponibile
  const { error: alterError1 } = await (supabase as any).rpc('exec_sql', {
    sql: `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'generated_apps' AND column_name = 'deployurl'
        ) THEN
          ALTER TABLE generated_apps ADD COLUMN "deployUrl" TEXT;
        END IF;
      END $$;
    `
  });

  const { error: alterError2 } = await (supabase as any).rpc('exec_sql', {
    sql: `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'generated_apps' AND column_name = 'repourl'
        ) THEN
          ALTER TABLE generated_apps ADD COLUMN "repoUrl" TEXT;
        END IF;
      END $$;
    `
  });

  // Se la funzione RPC non esiste, prova un approccio alternativo
  // In produzione, la tabella dovrebbe essere creata manualmente o via migration
  // Gli errori vengono ignorati perché la tabella potrebbe già esistere o le colonne potrebbero già essere presenti
}

// validateSyntax è importata da lib/code-generation.ts e usata tramite validateAndFixCode
// Le funzioni template (getOrdersTemplate, getInventoryTemplate, getCustomersTemplate, selectTemplateByPrompt)
// sono importate da lib/code-generation.ts e usate tramite getSafeTemplate

// NOTA: getSafeTemplate, validateAndFixCode, parseClaudeResponse, getBaseFiles sono importate da lib/code-generation.ts
// NOTA: createVercelDeployment, createAndPushGitHubRepo, getGitHubClient, withRetry sono importate da lib/github-deploy.ts

export async function POST(request: NextRequest) {
  try {
    console.log('[GENERATE] Inizio richiesta generazione');
    
    // Verifica API key Anthropic
    console.log('[GENERATE] Verifica API key Anthropic...');
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      console.error('[GENERATE] ANTHROPIC_API_KEY non configurata');
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY non configurata' },
        { status: 500 }
      );
    }
    console.log('[GENERATE] API key Anthropic verificata');

    // Leggi il body della richiesta
    console.log('[GENERATE] Lettura body richiesta...');
    const body = await request.json();
    const { prompt } = body;
    console.log('[GENERATE] Body letto, prompt length:', prompt?.length || 0);

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      console.error('[GENERATE] Prompt non valido');
      return NextResponse.json(
        { success: false, error: 'Prompt richiesto' },
        { status: 400 }
      );
    }

    // Inizializza Anthropic client
    console.log('[GENERATE] Inizializzazione Anthropic client...');
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });
    console.log('[GENERATE] Anthropic client inizializzato');

    // Costruisci il prompt per Claude
    console.log('[GENERATE] Costruzione prompt per Claude...');
    const claudePrompt = `CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. You MUST generate COMPLETE, COMPILABLE code
2. NEVER leave code incomplete or with placeholders
3. ALL type definitions must be complete:
   ❌ BAD: stato: 'bozza' |
   ✅ GOOD: stato: 'bozza' | 'confermato' | 'spedito'
4. ALL JSX tags must be properly closed
5. ALL functions must have complete implementations
6. NO comments like '// ... rest of code'
7. Test mentally that code compiles before responding

If you're unsure, prefer SIMPLE working code over complex broken code.

---

Genera un'applicazione Next.js 15 semplice per: ${prompt}

Crea SOLO questi 2 file:
- app/page.tsx (pagina principale con lista semplice)
- components/Form.tsx (form base per creazione/modifica)

Usa Tailwind per UI, tutto in italiano.
Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;
    console.log('[GENERATE] Prompt costruito, length:', claudePrompt.length);

    // Chiama Claude API con timeout di 2 minuti
    console.log('[GENERATE] Chiamata a Claude API (timeout 2 minuti)...');
    const startTime = Date.now();
    
    // Crea una promise per il timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout: la generazione ha superato i 2 minuti'));
      }, 120000); // 2 minuti
    });

    // Chiamata a Claude con race contro timeout
    const message = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: claudePrompt,
          },
        ],
      }),
      timeoutPromise,
    ]);
    
    const elapsedTime = Date.now() - startTime;
    console.log('[GENERATE] Risposta Claude ricevuta in', elapsedTime, 'ms');

    // Estrai il contenuto della risposta
    console.log('[GENERATE] Estrazione contenuto risposta...');
    const responseText = message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      })
      .join('\n');
    console.log('[GENERATE] Contenuto estratto, length:', responseText.length);

    // Parsea i file dalla risposta (usa funzione condivisa)
    console.log('[GENERATE] Parsing file dalla risposta...');
    const claudeFiles = parseClaudeResponse(responseText);
    console.log('[GENERATE] File parsati da Claude:', Object.keys(claudeFiles).length, 'file:', Object.keys(claudeFiles));

    if (Object.keys(claudeFiles).length === 0) {
      console.error('[GENERATE] Nessun file trovato nella risposta');
      return NextResponse.json(
        { success: false, error: 'Nessun file trovato nella risposta di Claude', rawResponse: responseText.substring(0, 500) },
        { status: 500 }
      );
    }

    // VALIDAZIONE E AUTO-FIX: Valida e fixa il codice PRIMA di salvare
    console.log('[GENERATE] Inizio validazione e auto-fix del codice...');
    const validationStartTime = Date.now();
    const validated = await validateAndFixCode(claudeFiles, prompt, anthropic, 1, validationStartTime);
    
    if (!validated.success) {
      if (validated.useFallback) {
        console.warn('[GENERATE] ⚠️  Validazione fallita. Usando SAFE_TEMPLATE fallback.');
        if (validated.errors && validated.errors.length > 0) {
          console.warn('[GENERATE] Errori finali:', validated.errors.map(e => `${e.file}: ${e.message}`).join('; '));
        }
      } else {
        console.warn('[GENERATE] ⚠️  Validazione fallita ma senza fallback.');
      }
    } else {
      console.log('[GENERATE] ✅ Codice validato con successo!');
    }
    
    // Usa i file validati (o fallback)
    const validatedFiles = validated.files;
    console.log('[GENERATE] File validati/finali:', Object.keys(validatedFiles).length);

    // Aggiungi file base necessari per Next.js (usa funzione condivisa)
    console.log('[GENERATE] Aggiunta file base standard...');
    const baseFiles = getBaseFiles();
    // Combina file base + file generati (i file generati hanno priorità se ci sono conflitti)
    const files = { ...baseFiles, ...validatedFiles };
    console.log('[GENERATE] File totali (base + generati):', Object.keys(files).length);

    // Inizializza Supabase
    console.log('[GENERATE] Inizializzazione Supabase client...');
    const supabase = getSupabaseClient();
    console.log('[GENERATE] Supabase client inizializzato');

    // Assicurati che la tabella esista (in produzione, usa migration)
    console.log('[GENERATE] Verifica/creazione tabella...');
    try {
      await ensureTableExists(supabase);
      console.log('[GENERATE] Tabella verificata/creata');
    } catch (error) {
      // Ignora errori se la tabella esiste già o se RPC non è disponibile
      console.warn('[GENERATE] Impossibile verificare/creare tabella:', error);
    }

    // Genera UUID per l'app
    console.log('[GENERATE] Generazione UUID...');
    const appId = randomUUID();
    console.log('[GENERATE] UUID generato:', appId);

    // Salva in Supabase
    console.log('[GENERATE] Salvataggio in Supabase...');
    const { data, error: supabaseError } = await supabase
      .from('generated_apps')
      .insert({
        id: appId,
        prompt: prompt,
        files: files,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('[GENERATE] Errore Supabase:', supabaseError);
      // Se la tabella non esiste, prova a crearla manualmente
      if (supabaseError.code === '42P01') {
        return NextResponse.json(
          { success: false, error: 'Tabella generated_apps non esiste. Crea la tabella manualmente in Supabase.' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Errore database: ${supabaseError.message}` },
        { status: 500 }
      );
    }
    console.log('[GENERATE] Dati salvati in Supabase con successo');

    // Crea repo GitHub e pusha file (usa funzioni condivise)
    let repoUrl: string | undefined;
    let deployUrl: string | undefined;
    
    try {
      console.log('[GENERATE] Creazione repo GitHub...');
      const githubResult = await createAndPushGitHubRepo(appId, files, prompt);
      repoUrl = githubResult.repoUrl;
      const repoName = `erp-app-${appId.substring(0, 8)}`;
      console.log('[GENERATE] Repo GitHub creato:', repoUrl);
      
      // Crea deployment su Vercel usando l'API (usa funzione condivisa)
      try {
        console.log('[GENERATE] Creazione deployment Vercel...');
        const vercelDeployUrl = await createVercelDeployment(repoName, repoUrl, appId);
        deployUrl = vercelDeployUrl;
        console.log('[GENERATE] ✅ Deployment Vercel creato:', deployUrl);
      } catch (vercelError) {
        console.error('[GENERATE] ⚠️  Errore durante creazione deployment Vercel:', vercelError);
        // Fallback al deployUrl generico se Vercel API fallisce
        deployUrl = githubResult.deployUrl;
        console.log('[GENERATE] ⚠️  Usando deployUrl generico come fallback:', deployUrl);
        // Non blocchiamo il flusso se Vercel fallisce
      }
      
      // Salva repoUrl e deployUrl nel database se disponibili
      if (repoUrl || deployUrl) {
        console.log('[GENERATE] Salvataggio repoUrl e deployUrl nel database...');
        const updateData: { repoUrl?: string; deployUrl?: string } = {};
        if (repoUrl) updateData.repoUrl = repoUrl;
        if (deployUrl) updateData.deployUrl = deployUrl;
        
        const { error: updateError } = await supabase
          .from('generated_apps')
          .update(updateData)
          .eq('id', appId);
        
        if (updateError) {
          console.warn('[GENERATE] Impossibile salvare repoUrl/deployUrl:', updateError);
          console.warn('[GENERATE] Errore code:', updateError.code, 'message:', updateError.message);
          // Se la colonna non esiste, suggeriamo di aggiungerla manualmente
          if (updateError.code === 'PGRST204' || updateError.message?.includes('column')) {
            console.warn('[GENERATE] ⚠️  Le colonne repoUrl/deployUrl non esistono nella tabella.');
            console.warn('[GENERATE] ⚠️  Esegui questo SQL in Supabase:');
            console.warn('[GENERATE] ⚠️  ALTER TABLE generated_apps ADD COLUMN IF NOT EXISTS "repoUrl" TEXT;');
            console.warn('[GENERATE] ⚠️  ALTER TABLE generated_apps ADD COLUMN IF NOT EXISTS "deployUrl" TEXT;');
          }
          // Non blocchiamo se il deployUrl non può essere salvato (colonna potrebbe non esistere)
        } else {
          console.log('[GENERATE] ✅ repoUrl e deployUrl salvati nel database');
        }
      }
    } catch (error) {
      console.error('[GENERATE] Errore durante creazione repo GitHub:', error);
      // Non blocchiamo la risposta se GitHub fallisce, ma loggiamo l'errore
      // L'app è comunque salvata in DB
    }

    // Restituisci successo
    const totalTime = Date.now() - startTime;
    console.log('[GENERATE] Generazione completata in', totalTime, 'ms');
    return NextResponse.json({
      success: true,
      id: appId,
      message: 'Applicazione generata!',
      filesCount: Object.keys(files).length,
      files: files,
      repoUrl: repoUrl,
      deployUrl: deployUrl,
    });
  } catch (error) {
    console.error('[GENERATE] Errore durante la generazione:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

