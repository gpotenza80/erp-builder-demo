import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { validateAndFixCode, getBaseFiles } from '@/lib/code-generation';
import { createAndPushGitHubRepo, createVercelDeployment } from '@/lib/github-deploy';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// Tipi per context-aware prompt
interface Module {
  id: string;
  name: string;
  type: string | null;
  schema?: any;
}

interface ModuleVersion {
  version_number: number;
  files: Record<string, string>;
  database_schema: any | null;
  created_by: string | null;
}

interface ConnectableModule extends Module {
  connectionType: string;
  schema?: any;
}

// Costruisci prompt context-aware
function buildIterativePrompt(params: {
  userRequest: string;
  currentModule: Module;
  currentVersion: ModuleVersion;
  connectableModules: ConnectableModule[];
}): string {
  const { userRequest, currentModule, currentVersion, connectableModules } = params;

  return `
SISTEMA: Assistente modifica ERP modulare

WORKSPACE CONTEXT:
- Modulo: ${currentModule.name}
- Versione: ${currentVersion.version_number}
- Ultima modifica: ${currentVersion.created_by || 'N/A'}

CODICE ATTUALE:
${JSON.stringify(currentVersion.files, null, 2)}

SCHEMA DATABASE CORRENTE:
${currentVersion.database_schema ? JSON.stringify(currentVersion.database_schema, null, 2) : 'Nessuno schema definito'}

MODULI COLLEGABILI:
${connectableModules.length > 0 ? connectableModules.map(m => `
- ${m.name} (${m.type || 'N/A'})
  Tipo connessione: ${m.connectionType}
  Schema: ${m.schema ? JSON.stringify(m.schema, null, 2) : 'Nessuno schema disponibile'}
  Disponibile per: foreign_key, api_call
`).join('\n') : 'Nessun modulo collegabile'}

RICHIESTA UTENTE:
${userRequest}

ISTRUZIONI CRITICHE:
1. Modifica SOLO i file necessari (non tutto) - usa === MODIFIED: path/to/file.tsx ===
2. Se la richiesta coinvolge altri moduli, usa le foreign key corrette
3. Mantieni retrocompatibilità quando possibile
4. Genera migration SQL se cambi schema database - usa === MIGRATION: migration.sql ===
5. Aggiungi validazioni business appropriate (es: sconto max 30%)
6. Tutti i tipi TypeScript devono essere completi
7. Tutti i tag JSX devono essere chiusi
8. Tutte le funzioni devono essere implementate completamente
9. NON lasciare codice incompleto o placeholder

OUTPUT FORMAT:
=== MODIFIED: path/to/file.tsx ===
[solo il codice modificato, completo e funzionante]

=== MIGRATION: migration.sql ===
[solo se cambi schema database, altrimenti ometti questa sezione]

=== EXPLANATION ===
[breve spiegazione modifiche in italiano]
`;
}

// Parsea la risposta di Claude per estrarre file, migration e explanation
function parseClaudeResponse(response: string): {
  files: Record<string, string>;
  migration?: string;
  explanation?: string;
} {
  const result: {
    files: Record<string, string>;
    migration?: string;
    explanation?: string;
  } = {
    files: {},
  };

  // Pattern per MODIFIED files
  const modifiedPattern = /=== MODIFIED: (.+?) ===\n([\s\S]*?)(?=\n=== (?:MODIFIED|MIGRATION|EXPLANATION):|$)/g;
  let match;
  while ((match = modifiedPattern.exec(response)) !== null) {
    const filename = match[1].trim();
    let content = match[2].trim();
    // Rimuovi markdown code blocks
    content = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
    if (filename && content) {
      result.files[filename] = content;
    }
  }

  // Pattern per MIGRATION
  const migrationPattern = /=== MIGRATION: (.+?) ===\n([\s\S]*?)(?=\n=== (?:MODIFIED|MIGRATION|EXPLANATION):|$)/g;
  const migrationMatch = migrationPattern.exec(response);
  if (migrationMatch) {
    let migration = migrationMatch[2].trim();
    migration = migration.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
    if (migration) {
      result.migration = migration;
    }
  }

  // Pattern per EXPLANATION
  const explanationPattern = /=== EXPLANATION ===\n([\s\S]*?)(?=\n=== (?:MODIFIED|MIGRATION|EXPLANATION):|$)/g;
  const explanationMatch = explanationPattern.exec(response);
  if (explanationMatch) {
    result.explanation = explanationMatch[1].trim();
  }

  // Fallback: se non trova MODIFIED, prova pattern vecchio
  if (Object.keys(result.files).length === 0) {
    const filePattern = /=== FILENAME: (.+?) ===/g;
    const matches: Array<{ filename: string; startIndex: number; endIndex: number }> = [];
    
    let fileMatch;
    while ((fileMatch = filePattern.exec(response)) !== null) {
      matches.push({
        filename: fileMatch[1].trim(),
        startIndex: fileMatch.index + fileMatch[0].length,
        endIndex: 0,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const endIndex = i < matches.length - 1 ? matches[i + 1].startIndex - matches[i + 1].filename.length - 20 : response.length;
      currentMatch.endIndex = endIndex;
      
      const content = response.substring(currentMatch.startIndex, currentMatch.endIndex).trim();
      const cleanedContent = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
      if (currentMatch.filename && cleanedContent) {
        result.files[currentMatch.filename] = cleanedContent;
      }
    }
  }

  return result;
}

// validateAndFixCode è importato da @/lib/code-generation

// createAndPushGitHubRepo e createVercelDeployment sono importati da @/lib/github-deploy
// validateAndFixCode è importato da @/lib/code-generation

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
    let currentVersion: any = null;

    if (versionId) {
      const { data: versionData } = await supabase
        .from('module_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionData) {
        currentVersion = versionData;
        currentFiles = versionData.files || {};
        currentPrompt = versionData.prompt || '';
        parentVersionId = versionData.id;
      }
    }

    // Genera nuovo codice con AI usando context-aware prompt
    console.log('[MODIFY] Generazione codice con AI (context-aware)...');
    
    const systemPrompt = `Sei un esperto sviluppatore Next.js e TypeScript specializzato in sistemi ERP modulari.
Genera codice COMPLETO, COMPILABILE e FUNZIONANTE.
NON lasciare codice incompleto o placeholder.
Tutti i tipi devono essere completi.
Tutti i tag JSX devono essere chiusi.
Tutte le funzioni devono essere implementate completamente.
Rispetta le relazioni tra moduli e le foreign key esistenti.`;

    // Carica moduli collegabili con schema completo
    const { data: connectedModules } = await supabase
      .from('module_connections')
      .select(`
        from_module_id,
        to_module_id,
        connection_type,
        config
      `)
      .or(`from_module_id.eq.${moduleId},to_module_id.eq.${moduleId}`);

    // Carica schema dei moduli collegabili
    const connectableModules: ConnectableModule[] = [];
    if (connectedModules) {
      for (const conn of connectedModules) {
        const connectedModuleId = conn.from_module_id === moduleId 
          ? conn.to_module_id 
          : conn.from_module_id;
        
        if (connectedModuleId && connectedModuleId !== moduleId) {
          // Carica dati del modulo collegato
          const { data: connectedModuleData } = await supabase
            .from('modules')
            .select('id, name, type, dev_version_id, staging_version_id, prod_version_id')
            .eq('id', connectedModuleId)
            .single();

          if (connectedModuleData) {
            const versionId = connectedModuleData.dev_version_id || 
                             connectedModuleData.staging_version_id || 
                             connectedModuleData.prod_version_id;

            let schema = null;
            if (versionId) {
              const { data: versionData } = await supabase
                .from('module_versions')
                .select('database_schema')
                .eq('id', versionId)
                .single();
              schema = versionData?.database_schema || null;
            }

            connectableModules.push({
              id: connectedModuleId,
              name: connectedModuleData.name || 'Unknown',
              type: connectedModuleData.type || null,
              connectionType: conn.connection_type,
              schema: schema,
            });
          }
        }
      }
    }

    // Costruisci prompt context-aware
    const userPrompt = buildIterativePrompt({
      userRequest: prompt,
      currentModule: {
        id: module.id,
        name: module.name,
        type: module.type,
      },
      currentVersion: {
        version_number: currentVersion?.version_number || 1,
        files: currentFiles,
        database_schema: currentVersion?.database_schema || null,
        created_by: currentVersion?.created_by || null,
      },
      connectableModules: connectableModules,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt,
      }],
    });

    // Estrai files, migration e explanation dal response
    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Risposta AI non valida');
    }

    const text = content.text;
    const parsedResponse = parseClaudeResponse(text);
    const modifiedFiles = parsedResponse.files;
    
    // Log explanation se presente
    if (parsedResponse.explanation) {
      console.log('[MODIFY] Spiegazione modifiche:', parsedResponse.explanation);
    }
    
    // Log migration se presente
    if (parsedResponse.migration) {
      console.log('[MODIFY] Migration SQL generata:', parsedResponse.migration.substring(0, 100) + '...');
    }

    if (Object.keys(modifiedFiles).length === 0) {
      throw new Error('Nessun file generato dalla AI');
    }

    // Applica DIFF: unisci file modificati con file esistenti
    const files: Record<string, string> = { ...currentFiles };
    const changedFiles: string[] = [];
    
    for (const [path, newContent] of Object.entries(modifiedFiles)) {
      files[path] = newContent;
      changedFiles.push(path);
    }

    console.log(`[MODIFY] File modificati: ${changedFiles.join(', ')}`);

    // Valida sintassi solo sui file modificati
    console.log('[MODIFY] Validazione sintassi sui file modificati...');
    const modifiedFilesForValidation: Record<string, string> = {};
    for (const path of changedFiles) {
      if (files[path]) {
        modifiedFilesForValidation[path] = files[path];
      }
    }
    
    // Usa validateAndFixCode dalla libreria condivisa
    const validated = await validateAndFixCode(modifiedFilesForValidation, prompt, anthropic, 1);
    if (validated.success) {
      // Applica fix
      for (const [path, content] of Object.entries(validated.files)) {
        files[path] = content;
      }
    } else {
      console.warn('[MODIFY] Validazione fallita, continua comunque');
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

    // Aggiorna schema database se migration è presente
    let updatedSchema = currentVersion?.database_schema || null;
    if (parsedResponse.migration) {
      // In futuro, potremmo parsare la migration SQL per aggiornare lo schema
      // Per ora, manteniamo lo schema esistente
      console.log('[MODIFY] Migration SQL disponibile ma schema non aggiornato automaticamente');
    }

    // Crea nuova versione
    const { data: newVersion, error: versionError } = await supabase
      .from('module_versions')
      .insert({
        module_id: moduleId,
        version_number: nextVersionNumber,
        prompt: prompt,
        files: files,
        database_schema: updatedSchema,
        status: 'draft',
        parent_version_id: parentVersionId,
        created_by: `Modifica iterativa in ${environment}${parsedResponse.explanation ? ': ' + parsedResponse.explanation.substring(0, 50) : ''}`,
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

    // Deploy su DEV
    console.log('[MODIFY] Deploy su DEV...');
    let devUrl: string | undefined;
    try {
      // Aggiungi file base
      const baseFiles = getBaseFiles();
      const allFiles = { ...baseFiles, ...files };
      
      const repoName = `erp-module-${moduleId.substring(0, 8)}`;
      const { repoUrl } = await createAndPushGitHubRepo(moduleId, allFiles, module.name);
      const deployUrl = await createVercelDeployment(repoName, repoUrl, moduleId);
      devUrl = deployUrl;
      
      // Aggiorna versione con deploy URL
      await supabase
        .from('module_versions')
        .update({
          dev_deploy_url: deployUrl,
          github_repo_url: repoUrl,
        })
        .eq('id', newVersion.id);
    } catch (error) {
      console.warn('[MODIFY] Errore deploy:', error);
      // Continua comunque
    }

    return NextResponse.json({
      success: true,
      version: newVersion,
      versionId: newVersion.id,
      devUrl: devUrl || undefined,
      changedFiles,
      migrationSql: parsedResponse.migration || undefined,
      explanation: parsedResponse.explanation || undefined,
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

