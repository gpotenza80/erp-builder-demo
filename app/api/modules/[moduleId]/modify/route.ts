import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';

// Import dinamico di esbuild
let esbuild: typeof import('esbuild') | null = null;
async function getEsbuild() {
  if (!esbuild) {
    esbuild = await import('esbuild');
  }
  return esbuild;
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function getGitHubClient() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }
  return new Octokit({ auth: token });
}

// Parsea la risposta di Claude per estrarre i file
function parseClaudeResponse(response: string): Record<string, string> {
  const files: Record<string, string> = {};
  const filePattern = /=== FILENAME: (.+?) ===/g;
  const matches: Array<{ filename: string; startIndex: number; endIndex: number }> = [];
  
  // Trova tutti i match
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    matches.push({
      filename: match[1].trim(),
      startIndex: match.index + match[0].length,
      endIndex: 0, // Sarà calcolato dopo
    });
  }

  // Estrai il contenuto per ogni file
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const endIndex = i < matches.length - 1 ? matches[i + 1].startIndex - matches[i + 1].filename.length - 20 : response.length;
    currentMatch.endIndex = endIndex;
    
    const content = response.substring(currentMatch.startIndex, currentMatch.endIndex).trim();
    // Rimuovi eventuali markdown code blocks
    const cleanedContent = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
    files[currentMatch.filename] = cleanedContent;
  }

  // Se non ci sono match con il pattern principale, prova pattern alternativi
  if (Object.keys(files).length === 0) {
    // Pattern alternativo: file con estensione seguito da contenuto
    const altPattern = /(?:^|\n)([\/\w\-\.]+\.(tsx?|jsx?|ts|js|json)):?\s*\n([\s\S]*?)(?=\n(?:[\/\w\-\.]+\.(?:tsx?|jsx?|ts|js|json)):|$)/g;
    let altMatch;
    while ((altMatch = altPattern.exec(response)) !== null) {
      const filename = altMatch[1].trim();
      let content = altMatch[3].trim();
      content = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
      if (filename && content && content.length > 10) {
        files[filename] = content;
      }
    }
  }

  return files;
}

// Valida sintassi
async function validateSyntax(files: Record<string, string>): Promise<Array<{ file: string; message: string }>> {
  const errors: Array<{ file: string; message: string }> = [];
  const esbuildModule = await getEsbuild();
  
  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) continue;
    try {
      await esbuildModule.transform(content, {
        loader: 'tsx',
        target: 'es2020',
      });
    } catch (error: any) {
      errors.push({
        file: filePath,
        message: error.message || 'Errore di sintassi',
      });
    }
  }
  return errors;
}

// POST - Modifica modulo con AI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const body = await request.json();
    const { prompt, environment = 'dev' } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt richiesto' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Carica modulo e versione corrente
    const { data: module, error: moduleError } = await supabase
      .from('modules')
      .select('*')
      .eq('id', moduleId)
      .single();

    if (moduleError || !module) {
      return NextResponse.json(
        { success: false, error: 'Modulo non trovato' },
        { status: 404 }
      );
    }

    // Carica versione corrente basata su environment
    const versionId = 
      environment === 'prod' ? module.prod_version_id :
      environment === 'staging' ? module.staging_version_id :
      module.dev_version_id;

    let currentFiles: Record<string, string> = {};
    let currentPrompt = '';
    let parentVersionId: string | null = null;

    if (versionId) {
      const { data: currentVersion } = await supabase
        .from('module_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (currentVersion) {
        currentFiles = currentVersion.files || {};
        currentPrompt = currentVersion.prompt || '';
        parentVersionId = currentVersion.id;
      }
    }

    // Genera nuovo codice con AI (riutilizza logica da generate/route.ts)
    console.log('[MODIFY] Generazione codice con AI...');
    
    const systemPrompt = `Sei un esperto sviluppatore Next.js e TypeScript. 
Genera codice COMPLETO, COMPILABILE e FUNZIONANTE.
NON lasciare codice incompleto o placeholder.
Tutti i tipi devono essere completi.
Tutti i tag JSX devono essere chiusi.
Tutte le funzioni devono essere implementate completamente.`;

    const userPrompt = currentFiles && Object.keys(currentFiles).length > 0
      ? `Modifica il modulo esistente "${module.name}" con questa richiesta: ${prompt}

CODICE ESISTENTE:
${Object.entries(currentFiles).map(([path, content]) => `=== FILENAME: ${path} ===\n${content}`).join('\n\n')}

PROMPT PRECEDENTE: ${currentPrompt}

MODIFICA RICHIESTA: ${prompt}

Genera il codice MODIFICATO completo mantenendo le funzionalità esistenti e aggiungendo le nuove richieste.`
      : `Crea un nuovo modulo "${module.name}" con questa descrizione: ${prompt}

Genera un'applicazione Next.js completa e funzionante.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    });

    // Estrai files dal response
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Risposta AI non valida');
    }

    const text = content.text;
    const files = parseClaudeResponse(text);

    if (Object.keys(files).length === 0) {
      throw new Error('Nessun file generato dalla AI');
    }

    // Valida sintassi
    console.log('[MODIFY] Validazione sintassi...');
    const errors = await validateSyntax(files);
    if (errors.length > 0) {
      console.warn('[MODIFY] Errori di sintassi trovati:', errors);
      // Continua comunque, ma logga gli errori
    }

    // Determina numero versione
    const { data: existingVersions } = await supabase
      .from('module_versions')
      .select('version_number')
      .eq('module_id', moduleId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersionNumber = existingVersions && existingVersions.length > 0
      ? existingVersions[0].version_number + 1
      : 1;

    // Crea nuova versione
    const { data: newVersion, error: versionError } = await supabase
      .from('module_versions')
      .insert({
        module_id: moduleId,
        version_number: nextVersionNumber,
        prompt: prompt,
        files: files,
        status: 'draft',
        parent_version_id: parentVersionId,
        created_by: `Modifica iterativa in ${environment}`,
      })
      .select()
      .single();

    if (versionError || !newVersion) {
      console.error('[MODIFY] Errore creazione versione:', versionError);
      return NextResponse.json(
        { success: false, error: versionError?.message || 'Errore creazione versione' },
        { status: 500 }
      );
    }

    // Aggiorna puntatore versione attiva nel modulo
    const updateField = 
      environment === 'prod' ? 'prod_version_id' :
      environment === 'staging' ? 'staging_version_id' :
      'dev_version_id';

    await supabase
      .from('modules')
      .update({
        [updateField]: newVersion.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', moduleId);

    return NextResponse.json({
      success: true,
      version: newVersion,
      message: 'Modulo modificato con successo',
    });
  } catch (error) {
    console.error('[MODIFY] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

