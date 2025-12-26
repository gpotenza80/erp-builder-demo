import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// POST - Crea connessione tra moduli
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromModuleId, toModuleId, type, config } = body;

    if (!fromModuleId || !toModuleId || !type) {
      return NextResponse.json(
        { success: false, error: 'fromModuleId, toModuleId e type richiesti' },
        { status: 400 }
      );
    }

    if (fromModuleId === toModuleId) {
      return NextResponse.json(
        { success: false, error: 'Un modulo non può essere collegato a se stesso' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Carica moduli
    const { data: fromModule } = await supabase
      .from('modules')
      .select('*')
      .eq('id', fromModuleId)
      .single();

    const { data: toModule } = await supabase
      .from('modules')
      .select('*')
      .eq('id', toModuleId)
      .single();

    if (!fromModule || !toModule) {
      return NextResponse.json(
        { success: false, error: 'Uno o entrambi i moduli non trovati' },
        { status: 404 }
      );
    }

    // Carica workspace (deve essere lo stesso)
    const { data: fromWorkspace } = await supabase
      .from('modules')
      .select('workspace_id')
      .eq('id', fromModuleId)
      .single();

    if (fromModule.workspace_id !== toModule.workspace_id) {
      return NextResponse.json(
        { success: false, error: 'I moduli devono appartenere allo stesso workspace' },
        { status: 400 }
      );
    }

    // Crea connessione
    const { data: connection, error: connectionError } = await supabase
      .from('module_connections')
      .insert({
        workspace_id: fromModule.workspace_id,
        from_module_id: fromModuleId,
        to_module_id: toModuleId,
        connection_type: type,
        config: config || {},
      })
      .select()
      .single();

    if (connectionError) {
      // Se già esiste, restituisci quella esistente
      if (connectionError.code === '23505') { // Unique violation
        const { data: existing } = await supabase
          .from('module_connections')
          .select('*')
          .eq('from_module_id', fromModuleId)
          .eq('to_module_id', toModuleId)
          .eq('connection_type', type)
          .single();

        if (existing) {
          return NextResponse.json({
            success: true,
            connectionId: existing.id,
            message: 'Connessione già esistente',
          });
        }
      }

      console.error('[CONNECT] Errore creazione connessione:', connectionError);
      return NextResponse.json(
        { success: false, error: connectionError.message },
        { status: 500 }
      );
    }

    // Se tipo è foreign_key, rigenera moduli con foreign keys
    if (type === 'foreign_key' && config) {
      console.log('[CONNECT] Rigenerazione moduli con foreign keys...');
      
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      
      // Rigenera fromModule
      await regenerateModuleWithForeignKeys(
        fromModuleId,
        toModuleId,
        config,
        'from',
        supabase,
        anthropic
      );

      // Rigenera toModule (se necessario)
      if (config.bidirectional) {
        await regenerateModuleWithForeignKeys(
          toModuleId,
          fromModuleId,
          config,
          'to',
          supabase,
          anthropic
        );
      }
    }

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      message: 'Connessione creata con successo',
    });
  } catch (error) {
    console.error('[CONNECT] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

// Rigenera modulo con foreign keys
async function regenerateModuleWithForeignKeys(
  moduleId: string,
  connectedModuleId: string,
  config: any,
  direction: 'from' | 'to',
  supabase: ReturnType<typeof getSupabaseClient>,
  anthropic: Anthropic
) {
  try {
    // Carica modulo e versione corrente
    const { data: module } = await supabase
      .from('modules')
      .select('*')
      .eq('id', moduleId)
      .single();

    const { data: connectedModule } = await supabase
      .from('modules')
      .select('*')
      .eq('id', connectedModuleId)
      .single();

    if (!module || !connectedModule) return;

    const versionId = module.dev_version_id;
    if (!versionId) return;

    const { data: version } = await supabase
      .from('module_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (!version) return;

    const currentFiles = version.files || {};

    // Genera prompt per aggiungere foreign key
    const fieldName = direction === 'from' ? config.fromField : config.toField;
    const referenceTable = direction === 'from' ? config.toTable : config.fromTable;
    const referenceField = direction === 'from' ? config.toField : config.fromField;

    const prompt = `Aggiungi una foreign key al modulo "${module.name}":
- Campo: ${fieldName}
- Tabella di riferimento: ${referenceTable}
- Campo di riferimento: ${referenceField}
- Modulo collegato: ${connectedModule.name}

Aggiorna lo schema database e il codice TypeScript per includere questa relazione.`;

    // Chiama AI per rigenerare (semplificato - in produzione usare endpoint modify)
    console.log(`[CONNECT] Rigenerazione ${module.name} con foreign key...`);
    
    // Per ora, solo logga - in produzione chiamare /api/modules/[moduleId]/modify
    // Questo evita dipendenze circolari e complessità
    
  } catch (error) {
    console.error('[CONNECT] Errore rigenerazione modulo:', error);
  }
}

