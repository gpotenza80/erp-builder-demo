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
      
      // Filtra solo i progetti ERP (erp-app- o erp-module-)
      const erpProjects = projectList
        .filter((p: any) => p.name && (p.name.startsWith('erp-app-') || p.name.startsWith('erp-module-')))
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
    const body = await request.json().catch(() => ({}));
    const forceDeleteAllModules = body.forceDeleteAllModules === true;
    
    console.log('[CLEANUP-VERCEL] Inizio pulizia progetti Vercel orfani...', forceDeleteAllModules ? '(FORCE DELETE ALL MODULES)' : '');
    
    const supabase = getSupabaseClient();
    
    // Leggi tutte le app e moduli esistenti
    console.log('[CLEANUP-VERCEL] Lettura app e moduli esistenti da Supabase...');
    
    // App legacy (generated_apps)
    const { data: existingApps, error: readAppsError } = await supabase
      .from('generated_apps')
      .select('id');
    
    // Moduli (modules)
    const { data: existingModules, error: readModulesError } = await supabase
      .from('modules')
      .select('id');
    
    if (readAppsError && readAppsError.code !== '42P01') {
      console.error('[CLEANUP-VERCEL] Errore lettura app:', readAppsError);
    }
    
    if (readModulesError && readModulesError.code !== '42P01') {
      console.error('[CLEANUP-VERCEL] Errore lettura moduli:', readModulesError);
    }
    
    const existingAppIds = new Set((existingApps || []).map((app: any) => app.id));
    const existingModuleIds = new Set((existingModules || []).map((module: any) => module.id));
    
    console.log('[CLEANUP-VERCEL] Trovate', existingAppIds.size, 'app e', existingModuleIds.size, 'moduli esistenti');
    console.log('[CLEANUP-VERCEL] App IDs:', Array.from(existingAppIds).slice(0, 5));
    console.log('[CLEANUP-VERCEL] Module IDs:', Array.from(existingModuleIds).slice(0, 5));
    
    // Ottieni tutti i progetti Vercel
    console.log('[CLEANUP-VERCEL] Ricerca progetti Vercel...');
    const allVercelProjects = await getAllVercelProjects();
    console.log('[CLEANUP-VERCEL] Trovati', allVercelProjects.length, 'progetti Vercel ERP:', allVercelProjects);
    
    // Trova progetti Vercel orfani (non hanno un'app o modulo corrispondente)
    const orphanProjects: string[] = [];
    for (const projectName of allVercelProjects) {
      let found = false;
      
      if (projectName.startsWith('erp-app-')) {
        // Progetto legacy: estrai UUID dal nome (erp-app-{primi 8 caratteri})
        const projectIdPrefix = projectName.replace('erp-app-', '');
        
        // Cerca se esiste un'app con questo prefisso
        for (const appId of existingAppIds) {
          if (appId.substring(0, 8) === projectIdPrefix) {
            found = true;
            break;
          }
        }
        
        // Anche i moduli possono avere progetti erp-app- (inconsistenza nella creazione)
        if (!found) {
          for (const moduleId of existingModuleIds) {
            if (moduleId.substring(0, 8) === projectIdPrefix) {
              found = true;
              break;
            }
          }
        }
      } else if (projectName.startsWith('erp-module-')) {
        // Progetto modulare: estrai UUID dal nome (erp-module-{primi 8 caratteri})
        const projectIdPrefix = projectName.replace('erp-module-', '');
        console.log('[CLEANUP-VERCEL] Verifica progetto modulare:', projectName, 'prefisso:', projectIdPrefix, 'moduli totali:', existingModuleIds.size);
        
        // Se forceDeleteAllModules è true, cancella tutti i progetti erp-module-
        if (forceDeleteAllModules) {
          console.log('[CLEANUP-VERCEL] ⚠️  FORCE DELETE: progetto', projectName, 'sarà cancellato');
          found = false; // Esplicitamente non trovato
        } else if (existingModuleIds.size === 0) {
          // Se non ci sono moduli nel database, tutti i progetti erp-module- sono orfani
          console.log('[CLEANUP-VERCEL] ⚠️  Nessun modulo nel database, progetto', projectName, 'sarà considerato orfano');
          found = false; // Esplicitamente non trovato
        } else {
          // Cerca se esiste un modulo con questo prefisso
          let matched = false;
          for (const moduleId of existingModuleIds) {
            const modulePrefix = moduleId.substring(0, 8);
            console.log('[CLEANUP-VERCEL] Confronto prefisso progetto', projectIdPrefix, 'con prefisso modulo', modulePrefix);
            if (modulePrefix === projectIdPrefix) {
              found = true;
              matched = true;
              console.log('[CLEANUP-VERCEL] ✅ Match trovato per', projectName, 'con modulo', moduleId);
              break;
            }
          }
          
          if (!matched) {
            console.log('[CLEANUP-VERCEL] ❌ Nessun match trovato per', projectName, '(prefisso:', projectIdPrefix, ') - sarà cancellato');
          }
        }
      }
      
      if (!found) {
        orphanProjects.push(projectName);
        console.log('[CLEANUP-VERCEL] Progetto orfano trovato:', projectName);
      }
    }
    
    console.log('[CLEANUP-VERCEL] Trovati', orphanProjects.length, 'progetti Vercel orfani da cancellare:', orphanProjects);
    
    if (orphanProjects.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Nessun progetto Vercel orfano trovato',
        deletedVercelProjects: 0,
        totalVercelProjects: allVercelProjects.length,
        orphanProjectsFound: 0,
        debug: {
          totalProjects: allVercelProjects.length,
          projectNames: allVercelProjects,
          existingAppIds: existingAppIds.size,
          existingModuleIds: existingModuleIds.size,
        },
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
      orphanProjects: orphanProjects,
      debug: {
        totalProjects: allVercelProjects.length,
        projectNames: allVercelProjects,
        existingAppIds: existingAppIds.size,
        existingModuleIds: existingModuleIds.size,
      },
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

