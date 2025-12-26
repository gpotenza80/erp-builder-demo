import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Inizializza Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials non configurate');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Cancella progetto Vercel
async function deleteVercelProject(projectName: string): Promise<boolean> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[CLEANUP-VERCEL] ⚠️  VERCEL_TOKEN non configurato.');
      return false;
    }
    
    console.log('[CLEANUP-VERCEL] Tentativo cancellazione progetto:', projectName);
    
    const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
      },
    });

    if (response.status === 404) {
      console.log('[CLEANUP-VERCEL] Progetto non trovato (già cancellato):', projectName);
      return true;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CLEANUP-VERCEL] Errore HTTP ${response.status}:`, errorText);
      return false;
    }

    console.log('[CLEANUP-VERCEL] ✅ Progetto cancellato:', projectName);
    return true;
  } catch (error: any) {
    console.error('[CLEANUP-VERCEL] ❌ Errore cancellazione progetto', projectName, ':', error.message);
    return false;
  }
}

// Ottieni tutti i progetti Vercel
async function getAllVercelProjects(): Promise<string[]> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[CLEANUP-VERCEL] ⚠️  VERCEL_TOKEN non configurato.');
      return [];
    }

    const projects: string[] = [];
    let next: number | null = null;

    do {
      const url: string = next 
        ? `https://api.vercel.com/v9/projects?limit=100&until=${next}`
        : 'https://api.vercel.com/v9/projects?limit=100';

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      });

      if (!response.ok) {
        console.error(`[CLEANUP-VERCEL] Errore HTTP ${response.status} durante ricerca progetti`);
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
    console.error('[CLEANUP-VERCEL] Errore durante ricerca progetti:', error.message);
    return [];
  }
}

// POST - Cancella solo i progetti Vercel orfani (senza app corrispondente)
export async function POST(request: NextRequest) {
  try {
    console.log('[CLEANUP-VERCEL] Inizio pulizia progetti Vercel orfani...');
    
    const supabase = getSupabaseClient();
    
    // Leggi tutte le app esistenti
    console.log('[CLEANUP-VERCEL] Lettura app esistenti da Supabase...');
    const { data: existingApps, error: readError } = await supabase
      .from('generated_apps')
      .select('id');
    
    if (readError) {
      console.error('[CLEANUP-VERCEL] Errore lettura app:', readError);
      return NextResponse.json(
        { success: false, error: readError.message },
        { status: 500 }
      );
    }
    
    const existingAppIds = new Set((existingApps || []).map((app: any) => app.id));
    console.log('[CLEANUP-VERCEL] Trovate', existingAppIds.size, 'app esistenti');
    
    // Ottieni tutti i progetti Vercel
    console.log('[CLEANUP-VERCEL] Ricerca progetti Vercel...');
    const allVercelProjects = await getAllVercelProjects();
    console.log('[CLEANUP-VERCEL] Trovati', allVercelProjects.length, 'progetti Vercel ERP');
    
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
    
    console.log('[CLEANUP-VERCEL] Trovati', orphanProjects.length, 'progetti Vercel orfani da cancellare');
    
    if (orphanProjects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nessun progetto Vercel orfano trovato',
        deletedVercelProjects: 0,
        totalVercelProjects: allVercelProjects.length,
      });
    }
    
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
    
    console.log('[CLEANUP-VERCEL] ✅ Pulizia completata!');
    
    return NextResponse.json({
      success: true,
      message: 'Pulizia progetti Vercel orfani completata',
      deletedVercelProjects: deletedVercelProjects,
      totalVercelProjects: allVercelProjects.length,
      orphanProjectsFound: orphanProjects.length,
    });
  } catch (error) {
    console.error('[CLEANUP-VERCEL] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

