import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// POST - Salva versione corrente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const body = await request.json();
    const { environment = 'dev' } = body;

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

    // Determina versione corrente
    const versionId = 
      environment === 'prod' ? module.prod_version_id :
      environment === 'staging' ? module.staging_version_id :
      module.dev_version_id;

    if (!versionId) {
      return NextResponse.json(
        { success: false, error: `Nessuna versione ${environment} da salvare` },
        { status: 400 }
      );
    }

    // Aggiorna status versione
    const statusField = 
      environment === 'prod' ? 'deployed_prod' :
      environment === 'staging' ? 'deployed_staging' :
      'deployed_dev';

    const { data: updatedVersion, error: updateError } = await supabase
      .from('module_versions')
      .update({
        status: statusField,
      })
      .eq('id', versionId)
      .select()
      .single();

    if (updateError) {
      console.error('[SAVE-VERSION] Errore:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      version: updatedVersion,
      message: `Versione salvata in ${environment.toUpperCase()}`,
    });
  } catch (error) {
    console.error('[SAVE-VERSION] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

