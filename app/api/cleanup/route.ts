import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';

// Inizializza Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials non configurate');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Inizializza GitHub client
function getGitHubClient() {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN non configurato');
  }

  return new Octokit({
    auth: githubToken,
  });
}

// Cancella repository GitHub
async function deleteGitHubRepository(repoName: string, username: string): Promise<boolean> {
  try {
    const octokit = getGitHubClient();
    
    console.log('[CLEANUP] Tentativo cancellazione repository:', repoName);
    
    await octokit.repos.delete({
      owner: username,
      repo: repoName,
    });
    
    console.log('[CLEANUP] ✅ Repository cancellato:', repoName);
    return true;
  } catch (error: any) {
    if (error.status === 404) {
      console.log('[CLEANUP] Repository non trovato (già cancellato):', repoName);
      return true;
    }
    console.error('[CLEANUP] ❌ Errore cancellazione repository', repoName, ':', error.message);
    return false;
  }
}

// Cancella progetto Vercel
async function deleteVercelProject(projectName: string): Promise<boolean> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[CLEANUP] [VERCEL] ⚠️  VERCEL_TOKEN non configurato. Saltando cancellazione progetto Vercel.');
      return false;
    }
    
    console.log('[CLEANUP] [VERCEL] Tentativo cancellazione progetto:', projectName);
    
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
      },
    });

    if (response.status === 404) {
      console.log('[CLEANUP] [VERCEL] Progetto non trovato (già cancellato):', projectName);
      return true;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CLEANUP] [VERCEL] Errore HTTP ${response.status}:`, errorText);
      return false;
    }

    console.log('[CLEANUP] [VERCEL] ✅ Progetto cancellato:', projectName);
    return true;
  } catch (error: any) {
    console.error('[CLEANUP] [VERCEL] ❌ Errore cancellazione progetto', projectName, ':', error.message);
    return false;
  }
}

// Ottieni tutti i progetti Vercel
async function getAllVercelProjects(): Promise<string[]> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[CLEANUP] [VERCEL] ⚠️  VERCEL_TOKEN non configurato. Saltando ricerca progetti Vercel.');
      return [];
    }

    const projects: string[] = [];
    let next: number | null = null;

    do {
      const url = next 
        ? `https://api.vercel.com/v9/projects?limit=100&until=${next}`
        : 'https://api.vercel.com/v9/projects?limit=100';

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[CLEANUP] [VERCEL] Errore HTTP ${response.status} durante ricerca progetti`);
        break;
      }

      const data = await response.json();
      const projectList = data.projects || [];
      
      // Filtra solo i progetti che iniziano con erp-app-
      const erpProjects = projectList
        .filter((p: any) => p.name && p.name.startsWith('erp-app-'))
        .map((p: any) => p.name);
      
      projects.push(...erpProjects);
      
      // Vercel API usa paginazione con 'pagination'
      next = data.pagination?.next || null;
    } while (next);

    return projects;
  } catch (error: any) {
    console.error('[CLEANUP] [VERCEL] Errore durante ricerca progetti:', error.message);
    return [];
  }
}

// POST - Cancella tutte le app e i repository associati
export async function POST(request: NextRequest) {
  try {
    console.log('[CLEANUP] Inizio pulizia completa...');
    
    const supabase = getSupabaseClient();
    const octokit = getGitHubClient();
    
    // Ottieni username GitHub
    const { data: userData } = await octokit.users.getAuthenticated();
    const username = userData.login;
    console.log('[CLEANUP] Username GitHub:', username);
    
    // PRIMA: Cancella tutti i repository GitHub che iniziano con erp-app- o erp-demo-
    console.log('[CLEANUP] Ricerca repository GitHub da cancellare...');
    const allRepos: string[] = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const { data: repos } = await octokit.repos.listForAuthenticatedUser({
          type: 'all',
          per_page: 100,
          page: page,
        });
        
        if (repos.length === 0) {
          hasMore = false;
          break;
        }
        
        // Filtra solo i repository che iniziano con erp-app- o erp-demo-
        const erpRepos = repos.filter(repo => 
          repo.name.startsWith('erp-app-') || repo.name.startsWith('erp-demo-')
        );
        
        allRepos.push(...erpRepos.map(repo => repo.name));
        
        console.log('[CLEANUP] Trovati', erpRepos.length, 'repository ERP alla pagina', page);
        
        if (repos.length < 100) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (error: any) {
        console.error('[CLEANUP] Errore durante ricerca repository:', error.message);
        hasMore = false;
      }
    }
    
    console.log('[CLEANUP] Trovati', allRepos.length, 'repository ERP totali da cancellare');
    
    // Cancella tutti i repository trovati
    let deletedRepos = 0;
    for (const repoName of allRepos) {
      const deleted = await deleteGitHubRepository(repoName, username);
      if (deleted) {
        deletedRepos++;
      }
      // Piccola pausa per evitare rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('[CLEANUP] Repository cancellati:', deletedRepos, '/', allRepos.length);
    
    // POI: Cancella progetti Vercel orfani
    console.log('[CLEANUP] [VERCEL] Ricerca progetti Vercel orfani...');
    const allVercelProjects = await getAllVercelProjects();
    console.log('[CLEANUP] [VERCEL] Trovati', allVercelProjects.length, 'progetti Vercel ERP');
    
    // Leggi le app esistenti per confrontare
    const { data: existingApps } = await supabase
      .from('generated_apps')
      .select('id');
    
    const existingAppIds = new Set((existingApps || []).map((app: any) => app.id));
    
    // Trova progetti Vercel orfani (non hanno un'app corrispondente)
    const orphanProjects: string[] = [];
    for (const projectName of allVercelProjects) {
      // Estrai UUID dal nome del progetto (erp-app-{primi 8 caratteri})
      const projectIdPrefix = projectName.replace('erp-app-', '');
      
      // Cerca se esiste un'app con questo prefisso
      let found = false;
      for (const appId of existingAppIds) {
        if (appId.substring(0, 8) === projectIdPrefix) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        orphanProjects.push(projectName);
      }
    }
    
    console.log('[CLEANUP] [VERCEL] Trovati', orphanProjects.length, 'progetti Vercel orfani da cancellare');
    
    // Cancella progetti Vercel orfani
    let deletedVercelProjects = 0;
    for (const projectName of orphanProjects) {
      const deleted = await deleteVercelProject(projectName);
      if (deleted) {
        deletedVercelProjects++;
      }
      // Piccola pausa per evitare rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('[CLEANUP] [VERCEL] Progetti Vercel cancellati:', deletedVercelProjects, '/', orphanProjects.length);
    
    // POI: Leggi e cancella tutte le app dal database
    console.log('[CLEANUP] Lettura tutte le app da Supabase...');
    const { data: apps, error: readError } = await supabase
      .from('generated_apps')
      .select('id');
    
    if (readError) {
      console.error('[CLEANUP] Errore lettura app:', readError);
      // Continua comunque se ci sono repository da cancellare
      if (allRepos.length === 0) {
        return NextResponse.json(
          { success: false, error: readError.message },
          { status: 500 }
        );
      }
    }
    
    const appsCount = apps?.length || 0;
    console.log('[CLEANUP] Trovate', appsCount, 'app da cancellare');
    
    // Cancella tutte le app da Supabase
    console.log('[CLEANUP] Cancellazione tutte le app da Supabase...');
    const { error: deleteError } = await supabase
      .from('generated_apps')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (usando un ID che non esiste)
    
    if (deleteError) {
      console.error('[CLEANUP] Errore cancellazione app:', deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }
    
    console.log('[CLEANUP] ✅ Pulizia completata!');
    
    return NextResponse.json({
      success: true,
      message: 'Pulizia completata con successo',
      deletedApps: appsCount,
      deletedRepos: deletedRepos,
      totalReposAttempted: allRepos.length,
      deletedVercelProjects: deletedVercelProjects,
      totalVercelProjectsAttempted: orphanProjects.length,
    });
  } catch (error) {
    console.error('[CLEANUP] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

