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

    const fixedFiles = parseClaudeResponse(responseText);
    return validateAndFixCode(fixedFiles, originalPrompt, anthropic, attempt + 1);
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

    // Genera nuovo codice con AI (riutilizza logica da generate/route.ts)
    console.log('[MODIFY] Generazione codice con AI...');
    
    const systemPrompt = `Sei un esperto sviluppatore Next.js e TypeScript. 
Genera codice COMPLETO, COMPILABILE e FUNZIONANTE.
NON lasciare codice incompleto o placeholder.
Tutti i tipi devono essere completi.
Tutti i tag JSX devono essere chiusi.
Tutte le funzioni devono essere implementate completamente.`;

    // Carica moduli collegabili per context
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

    // Costruisci context moduli collegabili
    const contextModules = connectedModules?.map((conn: any) => ({
      id: conn.from_module_id === moduleId ? conn.modules_to?.id : conn.modules_from?.id,
      name: conn.from_module_id === moduleId ? conn.modules_to?.name : conn.modules_from?.name,
      type: conn.from_module_id === moduleId ? conn.modules_to?.type : conn.modules_from?.type,
      connectionType: conn.connection_type,
    })) || [];

    // Carica schema database se disponibile
    const databaseSchema = currentVersion?.database_schema 
      ? JSON.stringify(currentVersion.database_schema, null, 2)
      : null;

    // Context-aware prompt building
    const contextInfo = [
      databaseSchema ? `SCHEMA DATABASE ATTUALE:\n${databaseSchema}\n` : '',
      contextModules.length > 0 
        ? `MODULI COLLEGABILI:\n${contextModules.map((m: any) => `- ${m.name} (${m.type}, connection: ${m.connectionType})`).join('\n')}\n`
        : '',
    ].filter(Boolean).join('\n');

    const userPrompt = currentFiles && Object.keys(currentFiles).length > 0
      ? `Modifica il modulo esistente "${module.name}" con questa richiesta: ${prompt}

${contextInfo}

CODICE ESISTENTE:
${Object.entries(currentFiles).map(([path, content]) => `=== FILENAME: ${path} ===\n${content}`).join('\n\n')}

PROMPT PRECEDENTE: ${currentPrompt}

MODIFICA RICHIESTA: ${prompt}

IMPORTANTE: Genera SOLO i file MODIFICATI (DIFF). Se un file non viene modificato, NON includerlo nella risposta.
Mantieni tutto il codice esistente che non viene modificato.
Genera SOLO i file che cambiano, separati da === FILENAME: path/file.tsx ===`
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
    const modifiedFiles = parseClaudeResponse(text);

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

