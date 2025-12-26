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

// GET - Dettaglio versione
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const supabase = getSupabaseClient();

    const { data: version, error } = await supabase
      .from('module_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error || !version) {
      return NextResponse.json(
        { success: false, error: 'Versione non trovata' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      version,
    });
  } catch (error) {
    console.error('[VERSION] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

