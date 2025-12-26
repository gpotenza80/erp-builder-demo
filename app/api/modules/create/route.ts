import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';

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

// Valida e fix codice (riutilizza logica da generate/route.ts)
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
    return {
      success: false,
      files,
      errors,
    };
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
    return {
      success: false,
      files,
      errors,
    };
  }
}

function parseClaudeResponse(response: string): Record<string, string> {
  const files: Record<string, string> = {};
  const filePattern = /=== FILENAME: (.+?) ===/g;
  const matches: Array<{ filename: string; startIndex: number; endIndex: number }> = [];
  
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    matches.push({
      filename: match[1].trim(),
      startIndex: match.index + match[0].length,
      endIndex: 0,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const endIndex = i < matches.length - 1 ? matches[i + 1].startIndex - matches[i + 1].filename.length - 20 : response.length;
    currentMatch.endIndex = endIndex;
    
    const content = response.substring(currentMatch.startIndex, currentMatch.endIndex).trim();
    const cleanedContent = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
    files[currentMatch.filename] = cleanedContent;
  }

  return files;
}

// File base per Next.js (riutilizza da generate/route.ts)
function getBaseFiles() {
  return {
    'package.json': JSON.stringify({
      name: 'erp-module',
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
      },
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
    'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;`,
    'tailwind.config.ts': `import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;`,
    'postcss.config.js': `module.exports = { plugins: { '@tailwindcss/postcss': {} } };`,
    '.gitignore': `node_modules\n.next\nout\n.env*.local\n.vercel`,
    'app/layout.tsx': `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}`,
    'app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`,
  };
}

// Crea repo GitHub e deploy Vercel (semplificato)
async function createDeployment(
  moduleId: string,
  files: Record<string, string>,
  moduleName: string
): Promise<{ repoUrl: string; deployUrl: string }> {
  const octokit = getGitHubClient();
  const repoName = `erp-module-${moduleId.substring(0, 8)}`;
  
  const { data: userData } = await octokit.users.getAuthenticated();
  const username = userData.login;

  // Crea repository
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

  // Push file
  const baseFiles = getBaseFiles();
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
    message: `Initial commit: ${moduleName}`,
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

  // Deploy Vercel (semplificato - usa API v9)
  const vercelToken = process.env.VERCEL_TOKEN;
  if (vercelToken) {
    try {
      const { data: repoData } = await octokit.rest.repos.get({
        owner: username,
        repo: repoName,
      });
      const repoId = repoData.id;

      // Crea progetto Vercel
      const projectResponse = await fetch('https://api.vercel.com/v9/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: repoName,
          framework: 'nextjs',
          gitRepository: {
            type: 'github',
            repo: `${username}/${repoName}`,
            repoId: repoId,
          },
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
        // Trigger deployment
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
            gitSource: {
              type: 'github',
              repoId: repoId,
              ref: 'main',
            },
          }),
        });
      }
    } catch (error) {
      console.warn('[CREATE] Errore deploy Vercel:', error);
    }
  }

  return { repoUrl, deployUrl };
}

// POST - Crea nuovo modulo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, name, prompt, type } = body;

    const supabase = getSupabaseClient();

    // Se workspaceId non è fornito, usa il primo workspace disponibile o creane uno
    let finalWorkspaceId = workspaceId;
    if (!finalWorkspaceId) {
      const { data: existingWorkspace } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (existingWorkspace) {
        finalWorkspaceId = existingWorkspace.id;
      } else {
        // Crea workspace di default
        const { data: newWorkspace } = await supabase
          .from('workspaces')
          .insert({
            user_id: 'default_user',
            name: 'My ERP Workspace',
            description: 'Il mio workspace ERP personalizzato'
          })
          .select()
          .single();

        if (!newWorkspace) {
          return NextResponse.json(
            { success: false, error: 'Errore creazione workspace' },
            { status: 500 }
          );
        }
        finalWorkspaceId = newWorkspace.id;
      }
    }

    // Se name non è fornito, estrailo dal prompt
    const finalName = name || prompt.substring(0, 50) || 'Nuovo Modulo';

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'prompt richiesto' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Genera slug
    const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Crea modulo
    const { data: module, error: moduleError } = await supabase
      .from('modules')
      .insert({
        workspace_id: finalWorkspaceId,
        name: finalName,
        slug,
        type: type || null,
        description: prompt.substring(0, 200),
      })
      .select()
      .single();

    if (moduleError || !module) {
      console.error('[CREATE] Errore creazione modulo:', moduleError);
      return NextResponse.json(
        { success: false, error: moduleError?.message || 'Errore creazione modulo' },
        { status: 500 }
      );
    }

    // Genera codice con AI
    console.log('[CREATE] Generazione codice con AI...');
    const systemPrompt = `Sei un esperto sviluppatore Next.js e TypeScript. 
Genera codice COMPLETO, COMPILABILE e FUNZIONANTE.
NON lasciare codice incompleto o placeholder.
Tutti i tipi devono essere completi.
Tutti i tag JSX devono essere chiusi.
Tutte le funzioni devono essere implementate completamente.`;

    const userPrompt = `Crea un nuovo modulo "${name}" con questa descrizione: ${prompt}

Genera un'applicazione Next.js completa e funzionante.
Crea SOLO questi file:
- app/page.tsx (pagina principale)
- components/Form.tsx (form base)

Usa Tailwind per UI, tutto in italiano.
Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    let files = parseClaudeResponse(responseText);

    // Valida e fix
    const validated = await validateAndFixCode(files, prompt, anthropic);
    if (!validated.success && validated.errors && validated.errors.length > 0) {
      console.warn('[CREATE] Errori di sintassi dopo validazione:', validated.errors);
      // Continua comunque
    }
    files = validated.files;

    // Deploy
    console.log('[CREATE] Deploy su GitHub e Vercel...');
    const { repoUrl, deployUrl } = await createDeployment(module.id, files, finalName);

    // Crea versione v1
    const { data: version, error: versionError } = await supabase
      .from('module_versions')
      .insert({
        module_id: module.id,
        version_number: 1,
        prompt,
        files,
        dev_deploy_url: deployUrl,
        github_repo_url: repoUrl,
        status: 'deployed_dev',
        created_by: 'Creazione nuovo modulo',
      })
      .select()
      .single();

    if (versionError || !version) {
      console.error('[CREATE] Errore creazione versione:', versionError);
      return NextResponse.json(
        { success: false, error: versionError?.message || 'Errore creazione versione' },
        { status: 500 }
      );
    }

    // Aggiorna modulo con dev_version_id
    await supabase
      .from('modules')
      .update({
        dev_version_id: version.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', module.id);

    return NextResponse.json({
      success: true,
      moduleId: module.id,
      versionId: version.id,
      devUrl: deployUrl,
    });
  } catch (error) {
    console.error('[CREATE] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

