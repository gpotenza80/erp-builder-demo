import Anthropic from '@anthropic-ai/sdk';
import { parseClaudeResponse } from './code-generation';
import { getBaseFiles } from './code-generation';

/**
 * Recupera i log di build da Vercel per un deployment specifico
 */
export async function getVercelBuildLogs(
  deploymentId: string,
  vercelToken: string
): Promise<{ logs: string; errorSummary: string }> {
  console.log('[AUTO-FIX] Recupero log di build da Vercel...');
  
  try {
    // Vercel API v2 per ottenere gli eventi del deployment
    const eventsResponse = await fetch(
      `https://api.vercel.com/v2/deployments/${deploymentId}/events`,
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      }
    );

    let events: any[] = [];

    if (eventsResponse.ok) {
      const eventsData = await eventsResponse.json();
      
      // Gli eventi possono essere un array o un oggetto con una proprietà
      if (Array.isArray(eventsData)) {
        events = eventsData;
      } else if (eventsData.events) {
        events = eventsData.events;
      } else if (eventsData.data) {
        events = eventsData.data;
      } else if (typeof eventsData === 'object') {
        // Prova a estrarre eventi da qualsiasi proprietà
        for (const key in eventsData) {
          if (Array.isArray(eventsData[key])) {
            events = eventsData[key];
            break;
          }
        }
      }
    } else {
      console.warn(`[AUTO-FIX] Impossibile recuperare eventi (${eventsResponse.status}), provo con deployment status...`);
    }

    // Fallback: prova a ottenere informazioni dal deployment status
    const deploymentResponse = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${vercelToken}`,
        },
      }
    );

    if (!deploymentResponse.ok) {
      throw new Error(`Impossibile recuperare deployment: ${deploymentResponse.status}`);
    }

    const deploymentData = await deploymentResponse.json();
    
    // Estrai log dagli eventi
    const logLines: string[] = [];
    let errorSummary = '';

    if (Array.isArray(events)) {
      for (const event of events) {
        if (event.type === 'command' && event.payload?.text) {
          logLines.push(event.payload.text);
        }
        if (event.type === 'stdout' && event.payload?.text) {
          logLines.push(event.payload.text);
        }
        if (event.type === 'stderr' && event.payload?.text) {
          logLines.push(`[ERROR] ${event.payload.text}`);
          if (!errorSummary) {
            errorSummary = event.payload.text.substring(0, 200);
          }
        }
        if (event.type === 'exit' && event.payload?.code !== 0) {
          logLines.push(`[EXIT CODE] ${event.payload.code}`);
        }
      }
    }

    const logs = logLines.join('\n');
    
    // Se non ci sono log, prova a estrarre errori dal deployment status
    if (!logs || logs.trim().length === 0) {
      const deploymentResponse = await fetch(
        `https://api.vercel.com/v13/deployments/${deploymentId}`,
        {
          headers: {
            'Authorization': `Bearer ${vercelToken}`,
          },
        }
      );

      if (deploymentResponse.ok) {
        const deploymentData = await deploymentResponse.json();
        const errorMessage = deploymentData.errorMessage || 
                            deploymentData.error?.message || 
                            'Errore sconosciuto';
        const buildError = deploymentData.build?.error || '';
        
        return {
          logs: `Error: ${errorMessage}\n${buildError ? `Build Error: ${JSON.stringify(buildError)}` : ''}`,
          errorSummary: errorMessage,
        };
      }
    }

    // Estrai errori comuni dai log
    if (!errorSummary) {
      const errorPatterns = [
        /error:\s*(.+)/i,
        /Error:\s*(.+)/i,
        /failed\s+to\s+(.+)/i,
        /Cannot\s+(.+)/i,
        /Module\s+not\s+found:\s*(.+)/i,
        /Cannot\s+find\s+module\s+['"](.+)['"]/i,
        /Type\s+error:\s*(.+)/i,
        /SyntaxError:\s*(.+)/i,
      ];

      for (const pattern of errorPatterns) {
        const match = logs.match(pattern);
        if (match) {
          errorSummary = match[1] || match[0];
          break;
        }
      }
    }

    if (!errorSummary) {
      // Prendi le ultime 10 righe come summary
      const lines = logs.split('\n').filter(l => l.trim().length > 0);
      errorSummary = lines.slice(-10).join('\n').substring(0, 300);
    }

    console.log('[AUTO-FIX] Log recuperati:', logs.length, 'caratteri');
    console.log('[AUTO-FIX] Error summary:', errorSummary.substring(0, 100));

    return { logs, errorSummary };
  } catch (error) {
    console.error('[AUTO-FIX] Errore recupero log:', error);
    return {
      logs: error instanceof Error ? error.message : 'Impossibile recuperare log',
      errorSummary: 'Errore sconosciuto durante build',
    };
  }
}

/**
 * Analizza i log per identificare errori comuni e suggerire fix
 */
export function analyzeBuildErrors(logs: string): {
  errorType: string;
  errorDetails: string;
  suggestedFix: string;
} {
  const lowerLogs = logs.toLowerCase();

  // Errori comuni e loro fix
  const errorPatterns = [
    {
      pattern: /cannot find module ['"](.+)['"]/i,
      type: 'missing_module',
      fix: 'Aggiungi il modulo mancante alle dipendenze in package.json',
    },
    {
      pattern: /module not found:\s*(.+)/i,
      type: 'missing_module',
      fix: 'Aggiungi il modulo mancante alle dipendenze in package.json',
    },
    {
      pattern: /type error/i,
      type: 'type_error',
      fix: 'Correggi gli errori di tipo TypeScript',
    },
    {
      pattern: /syntax error/i,
      type: 'syntax_error',
      fix: 'Correggi gli errori di sintassi nel codice',
    },
    {
      pattern: /cannot read property/i,
      type: 'runtime_error',
      fix: 'Aggiungi controlli null/undefined prima di accedere alle proprietà',
    },
    {
      pattern: /unexpected token/i,
      type: 'syntax_error',
      fix: 'Correggi la sintassi JavaScript/TypeScript',
    },
    {
      pattern: /export.*was not found/i,
      type: 'import_error',
      fix: 'Correggi gli import/export dei moduli',
    },
    {
      pattern: /hydration error/i,
      type: 'react_error',
      fix: 'Correggi gli errori di hydration React (mismatch tra server e client)',
    },
    {
      pattern: /build error/i,
      type: 'build_error',
      fix: 'Correggi gli errori di build (dipendenze, configurazione, ecc.)',
    },
  ];

  for (const { pattern, type, fix } of errorPatterns) {
    const match = logs.match(pattern);
    if (match) {
      return {
        errorType: type,
        errorDetails: match[0],
        suggestedFix: fix,
      };
    }
  }

  // Default
  return {
    errorType: 'unknown',
    errorDetails: logs.substring(0, 500),
    suggestedFix: 'Analizza i log per identificare il problema specifico',
  };
}

/**
 * Usa Claude per generare fix automatici basati sui log di build
 */
export async function autoFixBuildErrors(
  logs: string,
  errorSummary: string,
  currentFiles: Record<string, string>,
  originalPrompt: string,
  anthropic: Anthropic,
  attempt: number = 1
): Promise<{ success: boolean; fixedFiles: Record<string, string>; explanation: string }> {
  console.log(`[AUTO-FIX] Tentativo ${attempt}: generazione fix automatico...`);

  if (attempt > 2) {
    console.error('[AUTO-FIX] Max tentativi raggiunti, impossibile auto-fixare');
    return {
      success: false,
      fixedFiles: currentFiles,
      explanation: 'Impossibile auto-fixare dopo 2 tentativi',
    };
  }

  const analysis = analyzeBuildErrors(logs);
  console.log('[AUTO-FIX] Tipo errore identificato:', analysis.errorType);

  const fixPrompt = `SISTEMA: Assistente auto-fix per errori di build Vercel

ERRORE IDENTIFICATO:
Tipo: ${analysis.errorType}
Dettagli: ${analysis.errorDetails}
Suggerimento: ${analysis.suggestedFix}

LOG COMPLETI DI BUILD:
\`\`\`
${logs.substring(0, 3000)}${logs.length > 3000 ? '\n... (log troncato)' : ''}
\`\`\`

CODICE ATTUALE:
\`\`\`json
${JSON.stringify(currentFiles, null, 2).substring(0, 5000)}${JSON.stringify(currentFiles).length > 5000 ? '\n... (codice troncato)' : ''}
\`\`\`

PROMPT ORIGINALE:
${originalPrompt}

ISTRUZIONI CRITICHE:
1. Analizza i log di build per identificare l'errore specifico
2. Modifica SOLO i file necessari per fixare l'errore
3. Assicurati che il codice sia COMPLETO e COMPILABILE
4. Se manca un modulo, aggiungilo a package.json
5. Se c'è un errore di sintassi, correggilo
6. Se c'è un errore di tipo TypeScript, correggilo
7. Mantieni la compatibilità con il resto del codice
8. NON modificare file che non sono correlati all'errore

OUTPUT FORMAT:
=== MODIFIED: path/to/file.tsx ===
[codice completo del file modificato]

=== PACKAGE_JSON_UPDATE ===
[se necessario, solo le dipendenze da aggiungere/modificare in formato JSON]

=== EXPLANATION ===
[breve spiegazione del fix applicato in italiano]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: fixPrompt,
        },
      ],
    });

    const responseText = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    // Parsea la risposta
    const fixedFiles: Record<string, string> = { ...currentFiles };
    let explanation = '';

    // Estrai file modificati
    const modifiedPattern = /=== MODIFIED: (.+?) ===\n([\s\S]*?)(?=\n=== (?:MODIFIED|PACKAGE_JSON_UPDATE|EXPLANATION):|$)/g;
    let match;
    while ((match = modifiedPattern.exec(responseText)) !== null) {
      const filename = match[1].trim();
      let content = match[2].trim();
      content = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
      if (filename && content) {
        fixedFiles[filename] = content;
        console.log(`[AUTO-FIX] File modificato: ${filename}`);
      }
    }

    // Estrai aggiornamenti package.json
    const packageJsonPattern = /=== PACKAGE_JSON_UPDATE ===\n([\s\S]*?)(?=\n=== (?:MODIFIED|EXPLANATION):|$)/g;
    const packageMatch = packageJsonPattern.exec(responseText);
    if (packageMatch) {
      try {
        const packageUpdates = JSON.parse(packageMatch[1].trim());
        const baseFiles = getBaseFiles();
        const currentPackageJson = JSON.parse(baseFiles['package.json'] || '{}');
        
        // Merge delle dipendenze
        if (packageUpdates.dependencies) {
          currentPackageJson.dependencies = {
            ...currentPackageJson.dependencies,
            ...packageUpdates.dependencies,
          };
        }
        if (packageUpdates.devDependencies) {
          currentPackageJson.devDependencies = {
            ...currentPackageJson.devDependencies,
            ...packageUpdates.devDependencies,
          };
        }
        
        fixedFiles['package.json'] = JSON.stringify(currentPackageJson, null, 2);
        console.log('[AUTO-FIX] package.json aggiornato');
      } catch (e) {
        console.warn('[AUTO-FIX] Impossibile parsare aggiornamenti package.json');
      }
    }

    // Estrai explanation
    const explanationPattern = /=== EXPLANATION ===\n([\s\S]*?)(?=\n=== |$)/g;
    const explanationMatch = explanationPattern.exec(responseText);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    if (Object.keys(fixedFiles).length === Object.keys(currentFiles).length && 
        JSON.stringify(fixedFiles) === JSON.stringify(currentFiles)) {
      console.warn('[AUTO-FIX] Nessuna modifica generata, riprovo...');
      // Se non ci sono modifiche, riprova con più contesto
      return autoFixBuildErrors(logs, errorSummary, currentFiles, originalPrompt, anthropic, attempt + 1);
    }

    console.log(`[AUTO-FIX] ✅ Fix generato: ${Object.keys(fixedFiles).length} file, explanation: ${explanation.substring(0, 100)}`);

    return {
      success: true,
      fixedFiles,
      explanation: explanation || 'Fix automatico applicato',
    };
  } catch (error) {
    console.error('[AUTO-FIX] Errore durante generazione fix:', error);
    return {
      success: false,
      fixedFiles: currentFiles,
      explanation: error instanceof Error ? error.message : 'Errore durante auto-fix',
    };
  }
}

