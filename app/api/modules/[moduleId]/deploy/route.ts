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

  // Deploy su Vercel
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
        const projectData = await projectResponse.json();
        // Trigger deployment
        await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: repoName,
            project: projectData.id,
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
      console.warn('[DEPLOY] Errore deploy Vercel:', error);
    }
  }

  return { repoUrl, deployUrl };
}

// Genera migration SQL per PROD
async function generateMigrationSQL(
  module: any,
  version: any,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<string> {
  try {
    // Carica schema database dalla versione
    const schema = version.database_schema || {};
    
    // Carica connessioni per foreign keys
    const { data: connections } = await supabase
      .from('module_connections')
      .select('*')
      .or(`from_module_id.eq.${module.id},to_module_id.eq.${module.id}`);

    // Genera SQL basato su schema
    const tables = schema.tables || [];
    const sqlStatements: string[] = [];

    for (const table of tables) {
      const columns = table.columns || [];
      const columnDefs = columns.map((col: any) => {
        let def = `${col.name} ${col.type}`;
        if (col.primaryKey) def += ' PRIMARY KEY';
        if (col.notNull && !col.primaryKey) def += ' NOT NULL';
        if (col.default) def += ` DEFAULT ${col.default}`;
        return def;
      }).join(',\n    ');

      sqlStatements.push(`CREATE TABLE IF NOT EXISTS ${table.name} (
    ${columnDefs}
);`);

      // Aggiungi foreign keys dalle connessioni
      if (connections) {
        for (const conn of connections) {
          if (conn.connection_type === 'foreign_key' && conn.config) {
            const config = typeof conn.config === 'string' ? JSON.parse(conn.config) : conn.config;
            if (config.fromField && config.toField) {
              sqlStatements.push(`ALTER TABLE ${table.name} 
    ADD CONSTRAINT fk_${table.name}_${config.fromField} 
    FOREIGN KEY (${config.fromField}) 
    REFERENCES ${config.toTable || 'unknown'}(${config.toField});`);
            }
          }
        }
      }
    }

    return sqlStatements.join('\n\n');
  } catch (error) {
    console.error('[DEPLOY] Errore generazione migration SQL:', error);
    return '-- Migration SQL generation failed';
  }
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

    if (!environment || !['staging', 'production'].includes(environment)) {
      return NextResponse.json(
        { success: false, error: 'Environment deve essere staging o production' },
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
      environment === 'production' ? module.staging_version_id :
      module.dev_version_id;

    if (!sourceVersionId) {
      return NextResponse.json(
        { success: false, error: `Nessuna versione ${environment === 'production' ? 'staging' : 'dev'} disponibile per il deploy` },
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

    // Copia versione DEV corrente (crea nuova versione per l'ambiente target)
    const { data: existingVersions } = await supabase
      .from('module_versions')
      .select('version_number')
      .eq('module_id', moduleId)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersionNumber = existingVersions && existingVersions.length > 0
      ? existingVersions[0].version_number + 1
      : 1;

    // Crea nuova versione copiando da DEV
    const { data: newVersion, error: newVersionError } = await supabase
      .from('module_versions')
      .insert({
        module_id: moduleId,
        version_number: nextVersionNumber,
        prompt: `Deploy to ${environment.toUpperCase()}: ${version.prompt || 'Deployment'}`,
        files: version.files || {},
        database_schema: version.database_schema || null,
        parent_version_id: sourceVersionId,
        status: 'draft',
        created_by: `Deploy to ${environment.toUpperCase()}`,
      })
      .select()
      .single();

    if (newVersionError || !newVersion) {
      return NextResponse.json(
        { success: false, error: newVersionError?.message || 'Errore creazione versione' },
        { status: 500 }
      );
    }

    // Deploy (crea repo e push)
    console.log(`[DEPLOY] Deploy versione ${newVersion.version_number} in ${environment}...`);
    const { repoUrl, deployUrl } = await deployModuleVersion(
      moduleId,
      newVersion.id,
      newVersion.files || {},
      module.name
    );

    // Genera migration SQL se PROD
    let migrationSql: string | null = null;
    if (environment === 'production') {
      console.log('[DEPLOY] Generazione migration SQL per PROD...');
      migrationSql = await generateMigrationSQL(module, newVersion, supabase);
    }

    // Aggiorna versione con deploy URLs
    const deployUrlField = 
      environment === 'production' ? 'prod_deploy_url' :
      'staging_deploy_url';

    const statusField = 
      environment === 'production' ? 'deployed_prod' :
      'deployed_staging';

    await supabase
      .from('module_versions')
      .update({
        [deployUrlField]: deployUrl,
        github_repo_url: repoUrl,
        status: statusField,
      })
      .eq('id', newVersion.id);

    // Aggiorna puntatore versione nel modulo
    const versionField = 
      environment === 'production' ? 'prod_version_id' :
      'staging_version_id';

    await supabase
      .from('modules')
      .update({
        [versionField]: newVersion.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', moduleId);

    return NextResponse.json({
      success: true,
      deployUrl,
      migrationSql: migrationSql || undefined,
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

