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

// GET - Lista versioni di un modulo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const supabase = getSupabaseClient();

    const { data: versions, error } = await supabase
      .from('module_versions')
      .select('*')
      .eq('module_id', moduleId)
      .order('version_number', { ascending: false });

    if (error) {
      console.error('[VERSIONS] Errore:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Formatta response come richiesto
    const formattedVersions = (versions || []).map((v: any) => ({
      id: v.id,
      number: v.version_number,
      prompt: v.prompt,
      createdAt: v.created_at,
      status: v.status,
    }));

    return NextResponse.json({
      success: true,
      versions: formattedVersions,
    });
  } catch (error) {
    console.error('[VERSIONS] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

