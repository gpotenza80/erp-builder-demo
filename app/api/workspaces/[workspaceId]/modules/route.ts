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

// GET - Lista moduli di un workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await params;
    const supabase = getSupabaseClient();

    // Carica moduli con le versioni attive per ottenere deploy URLs
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[MODULES] Errore:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Per ogni modulo, carica le versioni attive per ottenere deploy URLs
    const modulesWithDeployUrls = await Promise.all(
      (modules || []).map(async (module) => {
        const deployUrls: {
          dev_deploy_url?: string;
          staging_deploy_url?: string;
          prod_deploy_url?: string;
        } = {};

        // Carica versione dev
        if (module.dev_version_id) {
          const { data: devVersion } = await supabase
            .from('module_versions')
            .select('dev_deploy_url')
            .eq('id', module.dev_version_id)
            .single();
          if (devVersion) deployUrls.dev_deploy_url = devVersion.dev_deploy_url || undefined;
        }

        // Carica versione staging
        if (module.staging_version_id) {
          const { data: stagingVersion } = await supabase
            .from('module_versions')
            .select('staging_deploy_url')
            .eq('id', module.staging_version_id)
            .single();
          if (stagingVersion) deployUrls.staging_deploy_url = stagingVersion.staging_deploy_url || undefined;
        }

        // Carica versione prod
        if (module.prod_version_id) {
          const { data: prodVersion } = await supabase
            .from('module_versions')
            .select('prod_deploy_url')
            .eq('id', module.prod_version_id)
            .single();
          if (prodVersion) deployUrls.prod_deploy_url = prodVersion.prod_deploy_url || undefined;
        }

        // Determina status
        let status: 'dev' | 'staging' | 'prod' | 'draft' = 'draft';
        if (deployUrls.prod_deploy_url) status = 'prod';
        else if (deployUrls.staging_deploy_url) status = 'staging';
        else if (deployUrls.dev_deploy_url) status = 'dev';

        return {
          ...module,
          ...deployUrls,
          status,
        };
      })
    );

    return NextResponse.json({
      success: true,
      modules: modulesWithDeployUrls,
    });
  } catch (error) {
    console.error('[MODULES] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

