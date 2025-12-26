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

// GET - Dettaglio modulo
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const supabase = getSupabaseClient();

    const { data: module, error } = await supabase
      .from('modules')
      .select('*')
      .eq('id', moduleId)
      .single();

    if (error || !module) {
      return NextResponse.json(
        { success: false, error: 'Modulo non trovato' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      module,
    });
  } catch (error) {
    console.error('[MODULE] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

// PATCH - Aggiorna modulo (es: nome)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const body = await request.json();
    const supabase = getSupabaseClient();

    const { data: module, error } = await supabase
      .from('modules')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', moduleId)
      .select()
      .single();

    if (error) {
      console.error('[MODULE] Errore aggiornamento:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      module,
    });
  } catch (error) {
    console.error('[MODULE] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

