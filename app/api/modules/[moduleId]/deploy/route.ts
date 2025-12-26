import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';

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

// Funzione helper per creare repo GitHub e deploy Vercel (semplificata)
async function deployModuleVersion(
  moduleId: string,
  versionId: string,
  files: Record<string, string>,
  moduleName: string
): Promise<{ repoUrl: string; deployUrl: string }> {
  const octokit = getGitHubClient();
  const repoName = `erp-module-${moduleId.substring(0, 8)}`;
  
  // Ottieni username GitHub
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
      // Repository già esistente, usa quello
      const { data: existingRepo } = await octokit.repos.get({
        owner: username,
        repo: repoName,
      });
      repo = existingRepo;
    } else {
      throw error;
    }
  }

  // Prepara file base + generati
  const baseFiles = {
    'package.json': JSON.stringify({
      name: repoName,
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
        paths: {
          '@/*': ['./*'],
        },
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
  };

  const allFiles = { ...baseFiles, ...files };

  // Push file su GitHub
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

  // Deploy su Vercel (semplificato - usa la logica esistente se necessario)
  // Per ora restituiamo solo l'URL, il deploy verrà fatto manualmente o via webhook

  return { repoUrl, deployUrl };
}

// POST - Deploy modulo
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const body = await request.json();
    const { environment } = body; // 'staging' | 'prod'

    if (!environment || !['staging', 'prod'].includes(environment)) {
      return NextResponse.json(
        { success: false, error: 'Environment deve essere staging o prod' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Carica modulo
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

    // Determina versione da deployare
    const sourceVersionId = 
      environment === 'prod' ? module.staging_version_id :
      module.dev_version_id;

    if (!sourceVersionId) {
      return NextResponse.json(
        { success: false, error: `Nessuna versione ${environment === 'prod' ? 'staging' : 'dev'} disponibile per il deploy` },
        { status: 400 }
      );
    }

    // Carica versione
    const { data: version, error: versionError } = await supabase
      .from('module_versions')
      .select('*')
      .eq('id', sourceVersionId)
      .single();

    if (versionError || !version) {
      return NextResponse.json(
        { success: false, error: 'Versione non trovata' },
        { status: 404 }
      );
    }

    // Deploy (crea repo e push)
    console.log(`[DEPLOY] Deploy versione ${version.version_number} in ${environment}...`);
    const { repoUrl, deployUrl } = await deployModuleVersion(
      moduleId,
      sourceVersionId,
      version.files || {},
      module.name
    );

    // Aggiorna versione con deploy URLs
    const deployUrlField = 
      environment === 'prod' ? 'prod_deploy_url' :
      'staging_deploy_url';

    const statusField = 
      environment === 'prod' ? 'deployed_prod' :
      'deployed_staging';

    await supabase
      .from('module_versions')
      .update({
        [deployUrlField]: deployUrl,
        github_repo_url: repoUrl,
        status: statusField,
      })
      .eq('id', sourceVersionId);

    // Aggiorna puntatore versione nel modulo
    const versionField = 
      environment === 'prod' ? 'prod_version_id' :
      'staging_version_id';

    await supabase
      .from('modules')
      .update({
        [versionField]: sourceVersionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', moduleId);

    return NextResponse.json({
      success: true,
      repoUrl,
      deployUrl,
      message: `Modulo deployato in ${environment.toUpperCase()}`,
    });
  } catch (error) {
    console.error('[DEPLOY] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

