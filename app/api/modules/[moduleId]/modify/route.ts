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

// Valida e fix codice (riutilizza logica)
async function validateAndFixCode(
  files: Record<string, string>,
  originalPrompt: string,
  anthropic: Anthropic,
  attempt: number = 1
): Promise<{ success: boolean; files: Record<string, string>; errors?: Array<{ file: string; message: string }> }> {
  const errors = await validateSyntax(files);
  
  if (errors.length === 0) {
    return { success: true, files };
  }
  
  if (attempt >= 3) {
    return { success: false, files, errors };
  }
  
  const fixPrompt = `CRITICAL INSTRUCTIONS - READ CAREFULLY:
1. You MUST generate COMPLETE, COMPILABLE code
2. NEVER leave code incomplete or with placeholders
3. ALL type definitions must be complete
4. ALL JSX tags must be properly closed
5. ALL functions must have complete implementations

Il codice precedente aveva questi errori:
${errors.map(e => `- ${e.file}: ${e.message}`).join('\n')}

Prompt originale: ${originalPrompt}

RIGENERA il codice COMPLETO fixando questi errori.
Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: fixPrompt }],
    });

    const responseText = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    const parsedResponse = parseClaudeResponse(responseText);
    return validateAndFixCode(parsedResponse.files, originalPrompt, anthropic, attempt + 1);
  } catch (error) {
    return { success: false, files, errors };
  }
}

// Crea deployment (semplificato)
async function createDeployment(
  moduleId: string,
  files: Record<string, string>,
  moduleName: string
): Promise<{ repoUrl: string; deployUrl: string }> {
  const octokit = getGitHubClient();
  const repoName = `erp-module-${moduleId.substring(0, 8)}`;
  
  const { data: userData } = await octokit.users.getAuthenticated();
  const username = userData.login;

  // Crea o ottieni repository
  let repo;
  try {
    const createRepoResponse = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
      auto_init: true,
      description: `ERP module: ${moduleName}`,
    });
    repo = createRepoResponse.data;
  } catch (error: any) {
    if (error.status === 422) {
      const { data: existingRepo } = await octokit.repos.get({
        owner: username,
        repo: repoName,
      });
      repo = existingRepo;
    } else {
      throw error;
    }
  }

  // Base files
  const baseFiles = {
    'package.json': JSON.stringify({
      name: repoName,
      version: '0.1.0',
      private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: {
        next: '^15.1.9',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@supabase/supabase-js': '^2.89.0',
        'framer-motion': '^12.23.26',
      },
      devDependencies: {
        '@types/node': '^20',
        '@types/react': '^19',
        '@types/react-dom': '^19',
        typescript: '^5',
        tailwindcss: '^4',
        '@tailwindcss/postcss': '^4',
        eslint: '^9',
        'eslint-config-next': '^15.1.9',
      },
    }, null, 2),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react-jsx',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules'],
    }, null, 2),
    'next.config.js': `const nextConfig = {}; module.exports = nextConfig;`,
    'tailwind.config.ts': `import type { Config } from "tailwindcss";
const config: Config = { content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: {} }, plugins: [] };
export default config;`,
    'postcss.config.js': `module.exports = { plugins: { '@tailwindcss/postcss': {} } };`,
    '.gitignore': `node_modules\n.next\nout\n.env*.local\n.vercel`,
    'app/layout.tsx': `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}`,
    'app/globals.css': `@tailwind base; @tailwind components; @tailwind utilities;`,
  };

  const allFiles = { ...baseFiles, ...files };
  const branchName = repo.default_branch || 'main';
  
  const { data: refData } = await octokit.git.getRef({
    owner: username,
    repo: repoName,
    ref: `heads/${branchName}`,
  });

  const { data: commitData } = await octokit.git.getCommit({
    owner: username,
    repo: repoName,
    commit_sha: refData.object.sha,
  });

  const blobShas: Record<string, string> = {};
  for (const [path, content] of Object.entries(allFiles)) {
    const { data: blobData } = await octokit.git.createBlob({
      owner: username,
      repo: repoName,
      content: Buffer.from(content as string).toString('base64'),
      encoding: 'base64',
    });
    blobShas[path] = blobData.sha;
  }

  const { data: treeData } = await octokit.git.createTree({
    owner: username,
    repo: repoName,
    base_tree: commitData.tree.sha,
    tree: Object.entries(allFiles).map(([path]) => ({
      path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blobShas[path],
    })),
  });

  const { data: commitResponse } = await octokit.git.createCommit({
    owner: username,
    repo: repoName,
    message: `Update module: ${moduleName}`,
    tree: treeData.sha,
    parents: [refData.object.sha],
  });

  await octokit.git.updateRef({
    owner: username,
    repo: repoName,
    ref: `heads/${branchName}`,
    sha: commitResponse.sha,
  });

  const repoUrl = repo.html_url;
  const deployUrl = `https://${repoName}.vercel.app`;

  // Deploy Vercel (semplificato)
  const vercelToken = process.env.VERCEL_TOKEN;
  if (vercelToken) {
    try {
      const { data: repoData } = await octokit.rest.repos.get({
        owner: username,
        repo: repoName,
      });
      const repoId = repoData.id;

      const projectResponse = await fetch('https://api.vercel.com/v9/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          framework: 'nextjs',
          gitRepository: { type: 'github', repo: `${username}/${repoName}`, repoId },
          environmentVariables: [
            {
              key: 'NEXT_PUBLIC_SUPABASE_URL',
              value: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
              type: 'plain',
              target: ['production', 'preview', 'development'],
            },
            {
              key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
              value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
              type: 'plain',
              target: ['production', 'preview', 'development'],
            },
          ],
        }),
      });

      if (projectResponse.ok) {
        await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: repoName,
            project: (await projectResponse.json()).id,
            target: 'production',
            gitSource: { type: 'github', repoId, ref: 'main' },
          }),
        });
      }
    } catch (error) {
      console.warn('[MODIFY] Errore deploy Vercel:', error);
    }
  }

  return { repoUrl, deployUrl };
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
        config,
        modules_from:from_module_id(id, name, type),
        modules_to:to_module_id(id, name, type)
      `)
      .or(`from_module_id.eq.${moduleId},to_module_id.eq.${moduleId}`);

    // Carica schema dei moduli collegabili
    const connectableModules: ConnectableModule[] = [];
    if (connectedModules) {
      for (const conn of connectedModules) {
        const connectedModuleId = conn.from_module_id === moduleId 
          ? conn.modules_to?.id 
          : conn.modules_from?.id;
        
        if (connectedModuleId) {
          // Carica versione corrente del modulo collegato per ottenere schema
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
              name: conn.from_module_id === moduleId 
                ? conn.modules_to?.name || 'Unknown'
                : conn.modules_from?.name || 'Unknown',
              type: conn.from_module_id === moduleId 
                ? conn.modules_to?.type || null
                : conn.modules_from?.type || null,
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
    
    const errors = await validateSyntax(modifiedFilesForValidation);
    if (errors.length > 0) {
      console.warn('[MODIFY] Errori di sintassi trovati:', errors);
      // Prova auto-fix
      const fixed = await validateAndFixCode(modifiedFilesForValidation, prompt, anthropic);
      if (fixed.success) {
        // Applica fix
        for (const [path, content] of Object.entries(fixed.files)) {
          files[path] = content;
        }
      } else {
        console.warn('[MODIFY] Auto-fix fallito, continua comunque');
      }
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
      const { repoUrl, deployUrl } = await createDeployment(moduleId, files, module.name);
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

