import { Octokit } from '@octokit/rest';
import { getBaseFiles } from './code-generation';

// Inizializza GitHub client
export function getGitHubClient() {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN non configurato');
  }

  return new Octokit({
    auth: githubToken,
  });
}

// Funzione con retry logic per operazioni GitHub
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  operationName: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RETRY] ${operationName} - Tentativo ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[RETRY] ${operationName} - Tentativo ${attempt} fallito:`, lastError.message);
      
      if (attempt < maxRetries) {
        const waitTime = delay * attempt; // Exponential backoff
        console.log(`[RETRY] Attesa ${waitTime}ms prima del prossimo tentativo...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} fallito dopo ${maxRetries} tentativi`);
}

// Crea e pusha repo GitHub con timeout e retry
export async function createAndPushGitHubRepo(
  appId: string,
  files: Record<string, string>,
  prompt: string
): Promise<{ repoUrl: string; deployUrl: string }> {
  console.log('[GITHUB] Inizio creazione repo GitHub...');
  
  const octokit = getGitHubClient();
  const repoName = `erp-app-${appId.substring(0, 8)}`;
  
  // Timeout di 2 minuti per l'intera operazione GitHub
  const githubTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout: operazione GitHub superata 2 minuti'));
    }, 120000);
  });

  return Promise.race([
    (async () => {
      // Ottieni username GitHub
      const username = await withRetry(
        async () => {
          const { data: userData } = await octokit.users.getAuthenticated();
          return userData.login;
        },
        3,
        1000,
        'getGitHubUsername'
      );
      console.log('[GITHUB] Username:', username);

      // Crea repository
      let repo;
      try {
        repo = await withRetry(
          async () => {
            const createRepoResponse = await octokit.repos.createForAuthenticatedUser({
              name: repoName,
              private: true,
              auto_init: true,
              description: `ERP app generata: ${prompt.substring(0, 100) || 'Generated app'}`,
            });
            return createRepoResponse.data;
          },
          3,
          2000,
          'createRepository'
        );
        console.log('[GITHUB] Repository creata:', repo.html_url);
      } catch (error: any) {
        if (error.status === 422 && (error.message?.includes('already exists') || error.message?.includes('name already exists'))) {
          console.log('[GITHUB] Repository già esistente, recupero...');
          repo = await withRetry(
            async () => {
              const { data: existingRepo } = await octokit.repos.get({
                owner: username,
                repo: repoName,
              });
              return existingRepo;
            },
            3,
            1000,
            'getExistingRepository'
          );
          console.log('[GITHUB] Repository esistente recuperata:', repo.html_url);
        } else {
          throw error;
        }
      }

      // Prepara file
      const baseFiles = getBaseFiles();
      const allFiles = { ...baseFiles, ...files };
      console.log('[GITHUB] File totali da pushare:', Object.keys(allFiles).length);

      // Ottieni SHA branch
      const branchSha = await withRetry(
        async () => {
          try {
            const { data: refData } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: 'heads/main',
            });
            return refData.object.sha;
          } catch (error: any) {
            const { data: refData } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: 'heads/master',
            });
            return refData.object.sha;
          }
        },
        3,
        1000,
        'getBranchSha'
      );
      console.log('[GITHUB] Branch SHA:', branchSha);

      // Ottieni tree commit
      const baseTreeSha = await withRetry(
        async () => {
          const { data: commitData } = await octokit.git.getCommit({
            owner: repo.owner.login,
            repo: repo.name,
            commit_sha: branchSha,
          });
          return commitData.tree.sha;
        },
        3,
        1000,
        'getBaseTreeSha'
      );
      console.log('[GITHUB] Base tree SHA:', baseTreeSha);

      // Crea blobs
      const blobShas: Record<string, string> = {};
      for (const [path, content] of Object.entries(allFiles)) {
        const blobSha = await withRetry(
          async () => {
            const { data: blobData } = await octokit.git.createBlob({
              owner: repo.owner.login,
              repo: repo.name,
              content: Buffer.from(content).toString('base64'),
              encoding: 'base64',
            });
            return blobData.sha;
          },
          2,
          500,
          `createBlob-${path}`
        );
        blobShas[path] = blobSha;
      }
      console.log('[GITHUB] Blobs creati:', Object.keys(blobShas).length);

      // Crea tree
      const treeSha = await withRetry(
        async () => {
          const { data: treeData } = await octokit.git.createTree({
            owner: repo.owner.login,
            repo: repo.name,
            base_tree: baseTreeSha,
            tree: Object.entries(allFiles).map(([path, _]) => ({
              path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: blobShas[path],
            })),
          });
          return treeData.sha;
        },
        3,
        1000,
        'createTree'
      );
      console.log('[GITHUB] Tree creato:', treeSha);

      // Crea commit
      const commitSha = await withRetry(
        async () => {
          const { data: commitResponse } = await octokit.git.createCommit({
            owner: repo.owner.login,
            repo: repo.name,
            message: 'Initial commit: Generated ERP app',
            tree: treeSha,
            parents: [branchSha],
          });
          return commitResponse.sha;
        },
        3,
        1000,
        'createCommit'
      );
      console.log('[GITHUB] Commit creato:', commitSha);

      // Aggiorna reference
      const branchName = repo.default_branch || 'main';
      await withRetry(
        async () => {
          await octokit.git.updateRef({
            owner: repo.owner.login,
            repo: repo.name,
            ref: `heads/${branchName}`,
            sha: commitSha,
          });
        },
        3,
        1000,
        'updateRef'
      );
      console.log('[GITHUB] Reference aggiornata');

      const repoUrl = repo.html_url;
      // Vercel genera automaticamente l'URL basandosi sul nome del repo
      // Il deployment potrebbe richiedere alcuni minuti per essere disponibile
      const deployUrl = `https://${repoName}.vercel.app`;

      return { repoUrl, deployUrl };
    })(),
    githubTimeout,
  ]);
}

// Crea progetto su Vercel usando l'API v9 e attende il deployment automatico
// Con supporto per auto-fix in caso di errori di build
export async function createVercelDeployment(
  repoName: string,
  repoUrl: string,
  appId: string,
  options?: {
    enableAutoFix?: boolean;
    currentFiles?: Record<string, string>;
    originalPrompt?: string;
    anthropic?: any;
    onAutoFix?: (fixedFiles: Record<string, string>) => Promise<void>;
  }
): Promise<string> {
  console.log('[VERCEL] Inizio creazione progetto Vercel...');
  
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    console.warn('[VERCEL] ⚠️  VERCEL_TOKEN non configurato. Saltando deployment automatico.');
    throw new Error('VERCEL_TOKEN non configurato');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[VERCEL] ⚠️  Credenziali Supabase non configurate per le env vars.');
  }

  // Estrai owner e repo da repoUrl (es: https://github.com/gpotenza80/erp-app-xxx)
  const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!repoMatch) {
    throw new Error(`Impossibile estrarre owner/repo da URL: ${repoUrl}`);
  }
  const [, owner, repo] = repoMatch;

  console.log('[VERCEL] Owner:', owner, 'Repo:', repo);

  // Timeout di 5 minuti per il deployment
  const vercelTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout: creazione deployment Vercel superata 5 minuti'));
    }, 300000); // 5 minuti
  });

  return Promise.race([
    (async () => {
      // STEP 1: Crea il progetto usando API v9
      console.log('[VERCEL] [STEP 1] Creazione progetto...');
      
      let projectId: string | null = null;
      let lastError: Error | null = null;

      // Retry logic per la creazione del progetto
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[VERCEL] [RETRY] Tentativo ${attempt}/3: creazione progetto...`);
          
          // Prepara il body della richiesta per creare il progetto
          const projectBody: any = {
            name: repoName,
            framework: 'nextjs',
            gitRepository: {
              type: 'github',
              repo: `${owner}/${repo}`,
            },
          };

          // Aggiungi env vars se disponibili
          if (supabaseUrl && supabaseAnonKey) {
            projectBody.environmentVariables = [
              {
                key: 'NEXT_PUBLIC_SUPABASE_URL',
                value: supabaseUrl,
                type: 'plain',
                target: ['production', 'preview', 'development'],
              },
              {
                key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                value: supabaseAnonKey,
                type: 'plain',
                target: ['production', 'preview', 'development'],
              },
            ];
            console.log('[VERCEL] Env vars formattate:', projectBody.environmentVariables.length, 'variables');
          }

          const response = await fetch('https://api.vercel.com/v9/projects', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(projectBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[VERCEL] Errore HTTP ${response.status}:`, errorText);
            throw new Error(`Vercel API error: ${response.status} - ${errorText}`);
          }

          const projectData = await response.json();
          projectId = projectData.id;
          console.log('[VERCEL] ✅ Progetto creato:', projectId);
          console.log('[VERCEL] Project name:', projectData.name);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[VERCEL] [RETRY] Tentativo ${attempt}/3 fallito:`, lastError.message);
          
          if (attempt < 3) {
            const waitTime = attempt * 2000; // Backoff esponenziale: 2s, 4s
            console.log(`[VERCEL] Attendo ${waitTime}ms prima di riprovare...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!projectId) {
        throw lastError || new Error('Impossibile creare progetto Vercel dopo 3 tentativi');
      }

      // STEP 2: Ottieni repoId da GitHub
      console.log('[VERCEL] [STEP 2] Ottenimento repoId da GitHub...');
      const octokit = getGitHubClient();
      let repoId: number | null = null;
      
      try {
        const repoData = await octokit.rest.repos.get({
          owner: owner,
          repo: repo,
        });
        repoId = repoData.data.id;
        console.log('[VERCEL] Repo ID ottenuto:', repoId);
      } catch (error) {
        console.warn('[VERCEL] ⚠️  Impossibile ottenere repoId da GitHub:', error);
        throw new Error('Impossibile ottenere repoId da GitHub per triggerare deployment');
      }

      // STEP 3: Triggera manualmente un deployment
      console.log('[VERCEL] [STEP 3] Trigger deployment manuale...');
      
      let deploymentId: string | null = null;
      lastError = null;

      // Retry logic per il trigger del deployment
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[VERCEL] [RETRY] Tentativo ${attempt}/3: trigger deployment...`);
          
          const deploymentBody = {
            name: repoName,
            project: projectId,
            target: 'production',
            gitSource: {
              type: 'github',
              repoId: repoId,
              ref: 'main',
            },
          };

          const deploymentResponse = await fetch('https://api.vercel.com/v13/deployments', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(deploymentBody),
          });

          if (!deploymentResponse.ok) {
            const errorText = await deploymentResponse.text();
            console.error(`[VERCEL] Errore HTTP ${deploymentResponse.status}:`, errorText);
            throw new Error(`Vercel API error: ${deploymentResponse.status} - ${errorText}`);
          }

          const deploymentData = await deploymentResponse.json();
          deploymentId = deploymentData.id;
          console.log('[VERCEL] Deployment triggerato:', deploymentId);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[VERCEL] [RETRY] Tentativo ${attempt}/3 fallito:`, lastError.message);
          
          if (attempt < 3) {
            const waitTime = attempt * 2000; // Backoff esponenziale: 2s, 4s
            console.log(`[VERCEL] Attendo ${waitTime}ms prima di riprovare...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!deploymentId) {
        throw lastError || new Error('Impossibile triggerare deployment Vercel dopo 3 tentativi');
      }

      // STEP 4: Polling dello stato del deployment specifico con auto-fix loop
      console.log('[VERCEL] [STEP 4] Polling stato deployment con auto-fix loop...');
      
      let deploymentUrl: string | null = null;
      let deploymentError: Error | null = null;
      const maxPollingAttempts = 30; // 30 tentativi * 10 secondi = 5 minuti max per deployment
      const pollingInterval = 10000; // 10 secondi
      const maxAutoFixAttempts = 5; // Max 5 tentativi di auto-fix
      let autoFixAttempt = 0;
      let currentDeploymentId = deploymentId;
      let currentFiles = options?.currentFiles || {};

      // Loop principale: polling + auto-fix fino a successo o max tentativi
      while (autoFixAttempt < maxAutoFixAttempts && !deploymentUrl && !deploymentError) {
        console.log(`[VERCEL] [AUTO-FIX LOOP] Tentativo ${autoFixAttempt + 1}/${maxAutoFixAttempts}`);

        for (let pollingAttempt = 1; pollingAttempt <= maxPollingAttempts; pollingAttempt++) {
        try {
          console.log(`[VERCEL] [POLLING] Tentativo ${pollingAttempt}/${maxPollingAttempts}: verifica stato deployment ${currentDeploymentId}...`);
          
          // Query GET /v13/deployments/{currentDeploymentId}
          const deploymentStatusResponse = await fetch(`https://api.vercel.com/v13/deployments/${currentDeploymentId}`, {
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
            },
          });

          if (!deploymentStatusResponse.ok) {
            console.warn(`[VERCEL] Errore HTTP ${deploymentStatusResponse.status} durante polling`);
            // Continua il polling solo se non è un errore 404 (deployment non trovato)
            if (deploymentStatusResponse.status === 404 && pollingAttempt > 3) {
              // Se dopo 3 tentativi il deployment non esiste, probabilmente c'è un problema
              deploymentError = new Error(`Deployment ${currentDeploymentId} non trovato su Vercel`);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
            continue;
          }

          const deploymentStatus = await deploymentStatusResponse.json();
          const readyState = deploymentStatus.readyState;
          
          console.log(`[VERCEL] Deployment state: ${readyState || 'UNKNOWN'}`);

          if (readyState === 'READY') {
            // Usa sempre l'URL del progetto (pubblico) invece dell'URL del deployment (può essere privato)
            // L'URL del progetto è sempre: https://{projectName}.vercel.app
            deploymentUrl = `https://${repoName}.vercel.app`;
            
            console.log('[VERCEL] ✅ Deployment READY!');
            console.log('[VERCEL] Deployment ID:', deploymentId);
            console.log('[VERCEL] Project URL:', deploymentUrl);
            break;
          }

          if (readyState === 'ERROR' || readyState === 'CANCELED') {
            // Estrai informazioni utili dall'errore
            const errorMessage = deploymentStatus.errorMessage || 
                                deploymentStatus.error?.message || 
                                'Deployment fallito su Vercel';
            const buildError = deploymentStatus.build?.error || null;
            const logsUrl = deploymentStatus.inspectorUrl || null;
            
            console.error('[VERCEL] ❌ Deployment fallito!');
            console.error('[VERCEL] Error message:', errorMessage);
            if (buildError) {
              console.error('[VERCEL] Build error:', buildError);
            }
            if (logsUrl) {
              console.error('[VERCEL] Logs disponibili su:', logsUrl);
            }
            
            // Se auto-fix è abilitato, esci dal polling loop per entrare nel while loop di auto-fix
            if (options?.enableAutoFix && autoFixAttempt < maxAutoFixAttempts) {
              break; // Esci dal polling loop, il while loop gestirà l'auto-fix
            }
            
            // Se auto-fix non è abilitato o abbiamo raggiunto il max tentativi, crea errore
            let detailedError = `Deployment Vercel fallito: ${errorMessage}`;
            if (buildError) {
              detailedError += `\nBuild error: ${JSON.stringify(buildError)}`;
            }
            if (logsUrl) {
              detailedError += `\nLogs: ${logsUrl}`;
            }
            deploymentError = new Error(detailedError);
            break; // Esci dal polling loop
          }

          // Attendi prima del prossimo polling
          if (pollingAttempt < maxPollingAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          }
        } catch (error) {
          // Se è un errore di deployment fallito, gestiscilo nel while loop
          if (error instanceof Error && error.message.includes('Deployment fallito')) {
            if (!options?.enableAutoFix || autoFixAttempt >= maxAutoFixAttempts) {
              deploymentError = error;
              break;
            }
            // Se auto-fix è abilitato, esci dal polling loop per entrare nel while loop
            break;
          }
          
          console.error(`[VERCEL] Errore durante polling (tentativo ${pollingAttempt}):`, error);
          // Continua il polling solo per errori di rete/temporanei
          if (pollingAttempt < maxPollingAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          }
        }
      } // Fine for loop polling

      // Se abbiamo un URL di deployment, esci dal while loop
      if (deploymentUrl) {
        break;
      }

      // Se abbiamo raggiunto il max di tentativi auto-fix, esci
      if (autoFixAttempt >= maxAutoFixAttempts) {
        if (!deploymentError) {
          deploymentError = new Error(`Deployment fallito dopo ${maxAutoFixAttempts} tentativi di auto-fix`);
        }
        break;
      }

      // Se non c'è errore ma il deployment non è ancora ready, continua il loop
      if (!deploymentError) {
        console.log(`[VERCEL] [AUTO-FIX LOOP] Continuo con tentativo ${autoFixAttempt + 1}...`);
        // Reset polling per il nuovo deployment
        continue;
      }
    } // Fine while loop auto-fix

      // Se c'è un errore di deployment, lancialo invece di restituire un URL generico
      if (deploymentError) {
        throw deploymentError;
      }

      if (!deploymentUrl) {
        // Fallback: usa il nome del progetto (solo se non c'è stato un errore)
        deploymentUrl = `https://${repoName}.vercel.app`;
        console.warn('[VERCEL] ⚠️  Deployment URL non ottenuto dal polling, usando URL generico:', deploymentUrl);
        console.warn('[VERCEL] ⚠️  Il deployment potrebbe essere ancora in corso o potrebbe essere fallito');
      }

      return deploymentUrl;
    })(),
    vercelTimeout,
  ]);
}

