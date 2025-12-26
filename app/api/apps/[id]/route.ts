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

// GET - Ottieni dettagli di un'app
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const appId = id;
    console.log('[APP-DETAIL] Richiesta dettagli app:', appId);
    
    if (!appId) {
      return NextResponse.json(
        { success: false, error: 'ID app richiesto' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    
    const { data: app, error } = await supabase
      .from('generated_apps')
      .select('*')
      .eq('id', appId)
      .single();

    if (error || !app) {
      console.error('[APP-DETAIL] Errore lettura app:', error);
      return NextResponse.json(
        { success: false, error: 'App non trovata' },
        { status: 404 }
      );
    }

    // Costruisci deployUrl se non è salvato (per app vecchie)
    // deployUrl potrebbe non esistere nella tabella, quindi usiamo optional chaining
    let deployUrl: string | undefined = (app as any).deployUrl;
    
    if (!deployUrl && app.files && Object.keys(app.files).length > 0) {
      // Genera il nome del repo basandosi sull'ID
      const repoName = `erp-app-${appId.substring(0, 8)}`;
      deployUrl = `https://${repoName}.vercel.app`;
    }

    const appData = {
      id: app.id,
      prompt: app.prompt,
      created_at: app.created_at,
      files: app.files || {},
      filesCount: app.files ? Object.keys(app.files).length : 0,
      deployUrl: deployUrl,
    };

    console.log('[APP-DETAIL] App trovata, file count:', appData.filesCount);
    
    return NextResponse.json({
      success: true,
      app: appData,
    });
  } catch (error) {
    console.error('[APP-DETAIL] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

