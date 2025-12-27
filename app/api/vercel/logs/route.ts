import { NextRequest, NextResponse } from 'next/server';

/**
 * Endpoint per recuperare e analizzare i log di un deployment Vercel
 * GET /api/vercel/logs?deploymentId=xxx
 * oppure
 * GET /api/vercel/logs?projectName=xxx (recupera l'ultimo deployment)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const deploymentId = searchParams.get('deploymentId');
    const projectName = searchParams.get('projectName');

    const vercelToken = process.env.VERCEL_TOKEN;
    if (!vercelToken) {
      return NextResponse.json(
        { success: false, error: 'VERCEL_TOKEN non configurato' },
        { status: 500 }
      );
    }

    let targetDeploymentId = deploymentId;

    // Se non abbiamo deploymentId, prova a ottenere l'ultimo deployment del progetto
    if (!targetDeploymentId && projectName) {
      try {
        // Ottieni projectId dal nome
        const projectResponse = await fetch(
          `https://api.vercel.com/v9/projects/${projectName}`,
          {
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
            },
          }
        );

        if (projectResponse.ok) {
          const projectData = await projectResponse.json();
          const projectId = projectData.id;

          // Ottieni ultimi deployment
          const deploymentsResponse = await fetch(
            `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5`,
            {
              headers: {
                'Authorization': `Bearer ${vercelToken}`,
              },
            }
          );

          if (deploymentsResponse.ok) {
            const deployments = await deploymentsResponse.json();
            if (deployments.deployments && deployments.deployments.length > 0) {
              // Prendi il primo (più recente)
              targetDeploymentId = deployments.deployments[0].uid;
              console.log('[LOGS] Deployment ID trovato:', targetDeploymentId);
            }
          }
        }
      } catch (error) {
        console.error('[LOGS] Errore recupero deployment:', error);
      }
    }

    if (!targetDeploymentId) {
      return NextResponse.json(
        { success: false, error: 'deploymentId o projectName richiesto' },
        { status: 400 }
      );
    }

    console.log('[LOGS] Recupero log per deployment:', targetDeploymentId);

    // Ottieni dettagli del deployment
    const deploymentResponse = await fetch(
      `https://api.vercel.com/v13/deployments/${targetDeploymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      }
    );

    if (!deploymentResponse.ok) {
      return NextResponse.json(
        { success: false, error: `Errore recupero deployment: ${deploymentResponse.status}` },
        { status: deploymentResponse.status }
      );
    }

    const deployment = await deploymentResponse.json();

    // Recupera eventi/log del deployment
    const eventsResponse = await fetch(
      `https://api.vercel.com/v2/deployments/${targetDeploymentId}/events`,
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      }
    );

    let events: any[] = [];
    let logs = '';
    let errorLogs = '';

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      
      // Gli eventi possono essere un array o un oggetto con una proprietà
      if (Array.isArray(eventsData)) {
        events = eventsData;
      } else if (eventsData.events) {
        events = eventsData.events;
      } else if (eventsData.data) {
        events = eventsData.data;
      }

      // Estrai log dagli eventi
      const logLines: string[] = [];
      const errorLines: string[] = [];

      for (const event of events) {
        if (event.type === 'command' && event.payload?.text) {
          logLines.push(`[CMD] ${event.payload.text}`);
        }
        if (event.type === 'stdout' && event.payload?.text) {
          logLines.push(event.payload.text);
        }
        if (event.type === 'stderr' && event.payload?.text) {
          const errorText = event.payload.text;
          logLines.push(`[ERROR] ${errorText}`);
          errorLines.push(errorText);
        }
        if (event.type === 'exit' && event.payload?.code !== undefined) {
          logLines.push(`[EXIT] Code: ${event.payload.code}`);
          if (event.payload.code !== 0) {
            errorLines.push(`Exit code: ${event.payload.code}`);
          }
        }
        if (event.type === 'build' && event.payload) {
          logLines.push(`[BUILD] ${JSON.stringify(event.payload)}`);
        }
      }

      logs = logLines.join('\n');
      errorLogs = errorLines.join('\n');
    } else {
      console.warn('[LOGS] Impossibile recuperare eventi, provo con deployment status...');
      // Fallback: usa informazioni dal deployment status
      if (deployment.errorMessage) {
        errorLogs = deployment.errorMessage;
      }
      if (deployment.build?.error) {
        errorLogs += '\n' + JSON.stringify(deployment.build.error);
      }
    }

    // Analizza errori comuni
    const errorAnalysis = {
      hasErrors: errorLogs.length > 0 || deployment.readyState === 'ERROR',
      errorTypes: [] as string[],
      suggestions: [] as string[],
    };

    const allLogs = logs + '\n' + errorLogs;
    const lowerLogs = allLogs.toLowerCase();

    // Identifica tipi di errore
    if (lowerLogs.includes('cannot find module') || lowerLogs.includes('module not found')) {
      errorAnalysis.errorTypes.push('missing_module');
      errorAnalysis.suggestions.push('Aggiungi il modulo mancante a package.json');
    }
    if (lowerLogs.includes('type error') || lowerLogs.includes('typescript')) {
      errorAnalysis.errorTypes.push('type_error');
      errorAnalysis.suggestions.push('Correggi gli errori di tipo TypeScript');
    }
    if (lowerLogs.includes('syntax error') || lowerLogs.includes('unexpected token')) {
      errorAnalysis.errorTypes.push('syntax_error');
      errorAnalysis.suggestions.push('Correggi gli errori di sintassi');
    }
    if (lowerLogs.includes('export') && lowerLogs.includes('not found')) {
      errorAnalysis.errorTypes.push('import_error');
      errorAnalysis.suggestions.push('Correggi gli import/export dei moduli');
    }
    if (lowerLogs.includes('hydration')) {
      errorAnalysis.errorTypes.push('react_error');
      errorAnalysis.suggestions.push('Correggi gli errori di hydration React');
    }

    return NextResponse.json({
      success: true,
      deployment: {
        id: deployment.id,
        url: deployment.url,
        readyState: deployment.readyState,
        errorMessage: deployment.errorMessage,
        inspectorUrl: deployment.inspectorUrl,
        createdAt: deployment.createdAt,
        buildingAt: deployment.buildingAt,
      },
      logs: {
        full: logs,
        errors: errorLogs,
        eventsCount: events.length,
      },
      analysis: errorAnalysis,
    });
  } catch (error) {
    console.error('[LOGS] Errore:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

