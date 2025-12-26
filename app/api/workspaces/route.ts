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

// GET - Lista workspace (per ora: workspace unico per user_id)
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id') || 'default_user';

    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[WORKSPACES] Errore:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workspaces: workspaces || [],
    });
  } catch (error) {
    console.error('[WORKSPACES] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

// POST - Crea nuovo workspace
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, name } = body;

    if (!user_id || !name) {
      return NextResponse.json(
        { success: false, error: 'user_id e name richiesti' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        user_id,
        name,
      })
      .select()
      .single();

    if (error) {
      console.error('[WORKSPACES] Errore creazione:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workspace,
    });
  } catch (error) {
    console.error('[WORKSPACES] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

