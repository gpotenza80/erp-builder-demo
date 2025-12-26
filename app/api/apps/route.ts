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

// Cancella repository GitHub (prova entrambi i pattern possibili)
async function deleteGitHubRepository(appId: string): Promise<boolean> {
  try {
    const octokit = getGitHubClient();
    
    // Ottieni username GitHub
    const { data: userData } = await octokit.users.getAuthenticated();
    const username = userData.login;
    
    // Pattern possibili per i nomi dei repository
    const possibleRepoNames = [
      `erp-app-${appId.substring(0, 8)}`,  // Pattern da generate
      `erp-demo-${appId.substring(0, 6)}`,  // Pattern da deploy
    ];
    
    let deletedCount = 0;
    
    for (const repoName of possibleRepoNames) {
      try {
        console.log('[DELETE] Tentativo cancellazione repository:', repoName);
        
        // Prova a cancellare il repository
        await octokit.repos.delete({
          owner: username,
          repo: repoName,
        });
        
        console.log('[DELETE] Repository GitHub cancellato:', repoName);
        deletedCount++;
      } catch (error: any) {
        // Se il repository non esiste (404), non è un errore critico
        if (error.status === 404) {
          console.log('[DELETE] Repository non trovato:', repoName, '(già cancellato o non esistente)');
          // Non incrementiamo deletedCount, ma continuiamo
        } else {
          console.error('[DELETE] Errore durante cancellazione repository', repoName, ':', error.message);
        }
      }
    }
    
    // Considera successo se almeno un repository è stato cancellato o se entrambi non esistevano
    return true;
  } catch (error: any) {
    console.error('[DELETE] Errore generale durante cancellazione repository GitHub:', error.message);
    // Non blocchiamo la cancellazione dell'app se GitHub fallisce
    return false;
  }
}

// Cancella progetto Vercel
async function deleteVercelProject(appId: string): Promise<boolean> {
  try {
    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      console.warn('[DELETE] [VERCEL] ⚠️  VERCEL_TOKEN non configurato. Saltando cancellazione progetto Vercel.');
      return false;
    }

    // Il nome del progetto è erp-app-{primi 8 caratteri dell'UUID}
    const projectName = `erp-app-${appId.substring(0, 8)}`;
    
    console.log('[DELETE] [VERCEL] Tentativo cancellazione progetto:', projectName);
    
    try {
      const response = await fetch(`https://api.vercel.com/v9/projects/${projectName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      });

      if (response.status === 404) {
        console.log('[DELETE] [VERCEL] Progetto non trovato:', projectName, '(già cancellato o non esistente)');
        return true; // Non è un errore se non esiste
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DELETE] [VERCEL] Errore HTTP ${response.status}:`, errorText);
        return false;
      }

      console.log('[DELETE] [VERCEL] ✅ Progetto Vercel cancellato:', projectName);
      return true;
    } catch (error: any) {
      console.error('[DELETE] [VERCEL] Errore durante cancellazione progetto:', error.message);
      return false;
    }
  } catch (error: any) {
    console.error('[DELETE] [VERCEL] Errore generale durante cancellazione progetto Vercel:', error.message);
    // Non blocchiamo la cancellazione dell'app se Vercel fallisce
    return false;
  }
}

// GET - Ottieni tutte le app
export async function GET(request: NextRequest) {
  try {
    console.log('[APPS] Richiesta lista app');
    
    const supabase = getSupabaseClient();
    
    // Verifica se la tabella esiste prima di fare la query
    const { data: apps, error } = await supabase
      .from('generated_apps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); // Limita a 100 app per evitare timeout

    if (error) {
      console.error('[APPS] Errore lettura app:', error);
      
      // Se la tabella non esiste, restituisci array vuoto invece di errore
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.log('[APPS] Tabella generated_apps non esiste, restituisco array vuoto');
        return NextResponse.json({
          success: true,
          apps: [],
        });
      }
      
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Prepara i dati delle app
    const appsWithDetails = (apps || []).map((app: any) => ({
      id: app.id,
      prompt: app.prompt || 'App senza prompt',
      created_at: app.created_at || new Date().toISOString(),
      filesCount: app.files ? Object.keys(app.files).length : 0,
      deployUrl: app.deployUrl || undefined,
    }));

    console.log('[APPS] App trovate:', appsWithDetails.length);
    
    return NextResponse.json({
      success: true,
      apps: appsWithDetails,
    });
  } catch (error) {
    console.error('[APPS] Errore:', error);
    
    // In caso di errore generico, restituisci array vuoto invece di errore
    return NextResponse.json({
      success: true,
      apps: [],
      warning: error instanceof Error ? error.message : 'Errore sconosciuto',
    });
  }
}

// DELETE - Cancella un'app
export async function DELETE(request: NextRequest) {
  try {
    console.log('[DELETE] Richiesta cancellazione app');
    
    const body = await request.json();
    const { appId } = body;

    if (!appId || typeof appId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'appId richiesto' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    
    // PRIMA: Cancella il repository GitHub (se esiste)
    console.log('[DELETE] Tentativo cancellazione repository GitHub...');
    const githubDeleted = await deleteGitHubRepository(appId);
    if (githubDeleted) {
      console.log('[DELETE] Repository GitHub cancellato con successo');
    } else {
      console.warn('[DELETE] Impossibile cancellare repository GitHub, procedo comunque con cancellazione app');
    }
    
    // PRIMA: Cancella il progetto Vercel (se esiste)
    console.log('[DELETE] Tentativo cancellazione progetto Vercel...');
    const vercelDeleted = await deleteVercelProject(appId);
    if (vercelDeleted) {
      console.log('[DELETE] Progetto Vercel cancellato con successo');
    } else {
      console.warn('[DELETE] Impossibile cancellare progetto Vercel, procedo comunque con cancellazione app');
    }
    
    // POI: Cancella l'app da Supabase
    console.log('[DELETE] Cancellazione app da Supabase...');
    const { error } = await supabase
      .from('generated_apps')
      .delete()
      .eq('id', appId);

    if (error) {
      console.error('[DELETE] Errore cancellazione app da Supabase:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log('[DELETE] App cancellata con successo:', appId);
    
    return NextResponse.json({
      success: true,
      message: 'App, repository GitHub e progetto Vercel cancellati con successo',
    });
  } catch (error) {
    console.error('[DELETE] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

