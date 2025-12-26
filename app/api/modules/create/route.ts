import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { parseClaudeResponse, validateAndFixCode, getBaseFiles } from '@/lib/code-generation';
import { createAndPushGitHubRepo, createVercelDeployment } from '@/lib/github-deploy';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(supabaseUrl, supabaseKey);
}

// POST - Crea nuovo modulo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspaceId, name, prompt, type } = body;

    const supabase = getSupabaseClient();

    // Se workspaceId non è fornito, usa il primo workspace disponibile o creane uno
    let finalWorkspaceId = workspaceId;
    if (!finalWorkspaceId) {
      const { data: existingWorkspace } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (existingWorkspace) {
        finalWorkspaceId = existingWorkspace.id;
      } else {
        // Crea workspace di default
        const { data: newWorkspace } = await supabase
          .from('workspaces')
          .insert({
            user_id: 'default_user',
            name: 'My ERP Workspace',
            description: 'Il mio workspace ERP personalizzato'
          })
          .select()
          .single();

        if (!newWorkspace) {
          return NextResponse.json(
            { success: false, error: 'Errore creazione workspace' },
            { status: 500 }
          );
        }
        finalWorkspaceId = newWorkspace.id;
      }
    }

    // Se name non è fornito, estrailo dal prompt
    const finalName = name || prompt.substring(0, 50) || 'Nuovo Modulo';

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'prompt richiesto' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Genera slug
    const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Crea modulo
    const { data: module, error: moduleError } = await supabase
      .from('modules')
      .insert({
        workspace_id: finalWorkspaceId,
        name: finalName,
        slug,
        type: type || null,
        description: prompt.substring(0, 200),
      })
      .select()
      .single();

    if (moduleError || !module) {
      console.error('[CREATE] Errore creazione modulo:', moduleError);
      return NextResponse.json(
        { success: false, error: moduleError?.message || 'Errore creazione modulo' },
        { status: 500 }
      );
    }

    // Genera codice con AI
    console.log('[CREATE] Generazione codice con AI...');
    const systemPrompt = `Sei un esperto sviluppatore Next.js e TypeScript. 
Genera codice COMPLETO, COMPILABILE e FUNZIONANTE.
NON lasciare codice incompleto o placeholder.
Tutti i tipi devono essere completi.
Tutti i tag JSX devono essere chiusi.
Tutte le funzioni devono essere implementate completamente.`;

    const userPrompt = `Crea un nuovo modulo "${name}" con questa descrizione: ${prompt}

Genera un'applicazione Next.js completa e funzionante.
Crea SOLO questi file:
- app/page.tsx (pagina principale)
- components/Form.tsx (form base)

Usa Tailwind per UI, tutto in italiano.
Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    let files = parseClaudeResponse(responseText);

    // Aggiungi file base
    const baseFiles = getBaseFiles();
    const allFiles = { ...baseFiles, ...files };

    // Valida e fix
    const validated = await validateAndFixCode(allFiles, prompt, anthropic, 1);
    if (!validated.success && validated.errors && validated.errors.length > 0) {
      console.warn('[CREATE] Errori di sintassi dopo validazione:', validated.errors);
      // Continua comunque
    }
    files = validated.files;

    // Deploy
    console.log('[CREATE] Deploy su GitHub e Vercel...');
    const { repoUrl } = await createAndPushGitHubRepo(module.id, files, finalName);
    const repoName = `erp-module-${module.id.substring(0, 8)}`;
    const deployUrl = await createVercelDeployment(repoName, repoUrl, module.id);

    // Crea versione v1
    const { data: version, error: versionError } = await supabase
      .from('module_versions')
      .insert({
        module_id: module.id,
        version_number: 1,
        prompt,
        files,
        dev_deploy_url: deployUrl,
        github_repo_url: repoUrl,
        status: 'deployed_dev',
        created_by: 'Creazione nuovo modulo',
      })
      .select()
      .single();

    if (versionError || !version) {
      console.error('[CREATE] Errore creazione versione:', versionError);
      return NextResponse.json(
        { success: false, error: versionError?.message || 'Errore creazione versione' },
        { status: 500 }
      );
    }

    // Aggiorna modulo con dev_version_id
    await supabase
      .from('modules')
      .update({
        dev_version_id: version.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', module.id);

    return NextResponse.json({
      success: true,
      moduleId: module.id,
      versionId: version.id,
      devUrl: deployUrl,
    });
  } catch (error) {
    console.error('[CREATE] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

