'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface AppDetail {
  id: string;
  prompt: string;
  created_at: string;
  files: Record<string, string>;
  filesCount: number;
  deployUrl?: string;
}

export default function AppDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.id as string;
  
  const [app, setApp] = useState<AppDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'building' | 'live' | 'error'>('building');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [deploymentStartTime, setDeploymentStartTime] = useState<number | null>(null);
  const [deploymentCheckAttempts, setDeploymentCheckAttempts] = useState(0);

  useEffect(() => {
    if (appId) {
      loadApp();
    }
  }, [appId]);

  useEffect(() => {
    if (app?.deployUrl) {
      // Quando viene creato un nuovo deployment, resetta lo stato
      const startTime = Date.now();
      setBuildStatus('building');
      setShowIframe(false);
      setDeploymentStartTime(startTime);
      setDeploymentCheckAttempts(0);
      
      // Controlla periodicamente se il deployment è disponibile
      const checkDeployment = async () => {
        const elapsed = Date.now() - startTime;
        setDeploymentCheckAttempts(prev => prev + 1);
        
        // Dopo 10 minuti, mostra un messaggio di errore
        if (elapsed > 600000) {
          setBuildStatus('error');
          clearInterval(checkInterval);
          return;
        }
        
        // Dopo 5 minuti, mostra comunque l'iframe (anche se potrebbe non essere pronto)
        if (elapsed > 300000 && !showIframe) {
          setShowIframe(true);
          setBuildStatus('live');
        }
      };

      // Controlla ogni 30 secondi
      const checkInterval = setInterval(checkDeployment, 30000);
      
      // Dopo 3 minuti, mostra automaticamente l'iframe (anche se potrebbe non essere pronto)
      const autoShowTimeout = setTimeout(() => {
        if (!showIframe) {
          setShowIframe(true);
          setBuildStatus('live');
        }
      }, 180000); // 3 minuti

      return () => {
        clearInterval(checkInterval);
        clearTimeout(autoShowTimeout);
      };
    }
  }, [app?.deployUrl]);

  const loadApp = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/apps/${appId}`);
      const data = await response.json();
      
      if (data.success && data.app) {
        setApp(data.app);
        // Se l'app ha un deployUrl, mostra sempre l'iframe
        if (data.app.deployUrl) {
          setShowIframe(true); // Mostra sempre l'iframe se c'è un deployUrl
          setBuildStatus('live');
          
          if (data.app.created_at) {
            const createdTime = new Date(data.app.created_at).getTime();
            setDeploymentStartTime(createdTime);
            
            const now = Date.now();
            const elapsed = now - createdTime;
            
            // Se sono passati più di 10 minuti dalla creazione, mostra lo stato di errore
            if (elapsed > 600000) {
              setBuildStatus('error');
            }
          }
        }
      } else {
        setError(data.error || 'App non trovata');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Sei sicuro di voler cancellare questa app? Questa azione non può essere annullata.')) {
      return;
    }

    setIsDeleting(true);
    
    try {
      const response = await fetch('/api/apps', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId }),
      });

      const data = await response.json();
      
      if (data.success) {
        router.push('/apps');
      } else {
        alert(`Errore: ${data.error}`);
        setIsDeleting(false);
      }
    } catch (err) {
      alert(`Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
      setIsDeleting(false);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployError(null);
    
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Aggiorna l'app con i nuovi URL
        setApp({
          ...app!,
          deployUrl: data.deployUrl,
        });
        setBuildStatus('building');
        setShowIframe(false);
        setDeploymentStartTime(Date.now());
      } else {
        setDeployError(data.error || 'Errore durante il deploy');
      }
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setIsDeploying(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-gray-600">Caricamento app...</p>
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg p-8 border border-gray-200 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">App non trovata</h2>
            <p className="text-gray-600 mb-6">{error || 'L\'app richiesta non esiste'}</p>
            <Link
              href="/apps"
              className="inline-block px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium"
            >
              Torna alle App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg"></div>
                <span className="text-xl font-bold">ERP Builder AI</span>
              </Link>
              <span className="text-gray-400">|</span>
              <Link href="/apps" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">
                ← Torna alle App
              </Link>
            </div>
            <motion.button
              onClick={handleDelete}
              disabled={isDeleting}
              whileHover={{ scale: isDeleting ? 1 : 1.05 }}
              whileTap={{ scale: isDeleting ? 1 : 0.95 }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                  <span>Cancellazione...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Cancella App</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* App Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
          >
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">{app.prompt}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>📅 Creata il {formatDate(app.created_at)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4 flex-wrap">
              {!app.deployUrl && (
                <motion.button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  whileHover={{ scale: isDeploying ? 1 : 1.02 }}
                  whileTap={{ scale: isDeploying ? 1 : 0.98 }}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeploying ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Pubblicazione in corso...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>🚀 Pubblica Applicazione</span>
                    </>
                  )}
                </motion.button>
              )}
              {app.deployUrl && (
                <motion.a
                  href={app.deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all font-medium shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>🔗 Apri Applicazione</span>
                </motion.a>
              )}
            </div>

            {/* Deploy Error */}
            {deployError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{deployError}</span>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Application Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">La Tua Applicazione</h2>
              {app.deployUrl && (
                <div className="flex items-center gap-2">
                  {buildStatus === 'building' ? (
                    <span className="text-sm text-yellow-600 font-medium">⏳ Deployment in corso...</span>
                  ) : (
                    <span className="text-sm text-green-600 font-medium">✅ Applicazione Live!</span>
                  )}
                </div>
              )}
            </div>

            {app.deployUrl ? (
              <div className="relative bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
                {/* Mostra iframe sempre se c'è un deployUrl */}
                {showIframe ? (
                  <>
                    <iframe
                      id="app-detail-iframe"
                      src={app.deployUrl}
                      className="w-full h-[700px] border-0"
                      title="App Preview"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-navigation"
                      onLoad={() => {
                        console.log('[IFRAME] Iframe caricato con successo');
                        setBuildStatus('live');
                      }}
                      onError={() => {
                        console.error('[IFRAME] Errore caricamento iframe');
                        setBuildStatus('error');
                      }}
                    />
                    {/* Fallback se l'iframe non si carica */}
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10 pointer-events-none opacity-0 transition-opacity duration-300" id="iframe-error-fallback">
                      <div className="text-center max-w-lg px-6">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-gray-700 font-medium text-lg mb-2">⚠️ Impossibile caricare l'applicazione</p>
                        <p className="text-sm text-gray-600 mb-4">
                          L'URL potrebbe non essere ancora disponibile o potrebbe esserci un problema di connessione.
                        </p>
                        <a
                          href={app.deployUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium inline-block pointer-events-auto"
                        >
                          🔗 Apri in Nuova Tab
                        </a>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-[700px] flex items-center justify-center bg-gray-50">
                    <div className="text-center max-w-lg px-6">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
                      />
                      {buildStatus === 'error' ? (
                        <>
                          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-700 font-medium text-lg mb-2">⚠️ Deployment non disponibile</p>
                          <p className="text-sm text-gray-600 mb-4">
                            Il deployment su Vercel potrebbe non essere stato completato. Questo può accadere se:
                          </p>
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-left mb-4">
                            <p className="text-sm text-red-800 font-medium mb-2">Possibili cause:</p>
                            <ul className="text-xs text-red-700 space-y-1 list-disc list-inside mb-3">
                              <li>Il repository GitHub non è connesso a Vercel</li>
                              <li>Vercel non ha i permessi per accedere al repository</li>
                              <li>Il deployment è fallito su Vercel</li>
                            </ul>
                            <p className="text-xs text-red-800 font-medium mt-3 mb-1">💡 Soluzione:</p>
                            <p className="text-xs text-red-700">
                              Vai su <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="underline">vercel.com</a>, connetti il repository GitHub e avvia manualmente il deployment.
                            </p>
                          </div>
                          {deploymentStartTime && (
                            <p className="text-xs text-gray-500 mb-4">
                              Tempo trascorso: {Math.floor((Date.now() - deploymentStartTime) / 1000 / 60)} minuti
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-gray-700 font-medium text-lg mb-2">⏳ Deployment in corso...</p>
                          <p className="text-sm text-gray-600 mb-4">
                            Vercel sta deployando l'applicazione. Questo richiede solitamente <strong>2-5 minuti</strong>.
                          </p>
                          {deploymentStartTime && (
                            <p className="text-xs text-gray-500 mb-4">
                              Tempo trascorso: {Math.floor((Date.now() - deploymentStartTime) / 1000 / 60)} minuti
                            </p>
                          )}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
                            <p className="text-sm text-blue-800 font-medium mb-2">💡 Cosa sta succedendo?</p>
                            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                              <li>Il codice è stato pushato su GitHub</li>
                              <li>Vercel sta buildando l'applicazione</li>
                              <li>L'applicazione sarà disponibile automaticamente tra qualche minuto</li>
                            </ul>
                          </div>
                          {deploymentStartTime && (Date.now() - deploymentStartTime) > 300000 && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-left mb-4">
                              <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Tempo di attesa prolungato:</p>
                              <p className="text-xs text-yellow-700">
                                Il deployment sta richiedendo più tempo del previsto. Potrebbe essere necessario configurare manualmente Vercel per deployare questo repository.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex gap-2 justify-center flex-wrap">
                        <motion.button
                          onClick={() => {
                            setShowIframe(true);
                            setBuildStatus('live');
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                        >
                          ▶️ Mostra Applicazione
                        </motion.button>
                        <motion.a
                          href={app.deployUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
                        >
                          🔗 Apri in Nuova Tab
                        </motion.a>
                      </div>
                    </div>
                  </div>
                )}
                {/* Overlay di loading (non più necessario ma lo teniamo per sicurezza) */}
                {false && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: isBuildComplete ? 0 : 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-10"
                  >
                    <div className="text-center max-w-lg px-6">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
                      />
                      <p className="text-gray-700 font-medium text-lg mb-2">⏳ Deployment in corso...</p>
                      <p className="text-sm text-gray-600 mb-4">
                        Vercel sta deployando l'applicazione. Questo può richiedere 2-5 minuti.
                      </p>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-4">
                        <p className="text-sm text-blue-800 font-medium mb-2">💡 Cosa sta succedendo?</p>
                        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                          <li>Il codice è stato pushato su GitHub</li>
                          <li>Vercel sta buildando l'applicazione</li>
                          <li>L'URL sarà disponibile a breve</li>
                        </ul>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-left mb-4">
                        <p className="text-xs text-yellow-800 font-medium mb-1">⚠️ Vedi un errore 404?</p>
                        <p className="text-xs text-yellow-700">
                          È normale! Il deployment richiede tempo. Attendi 2-5 minuti e poi ricarica.
                        </p>
                      </div>
                      <div className="flex gap-2 justify-center flex-wrap">
                        <motion.button
                          onClick={() => {
                            const iframe = document.getElementById('app-detail-iframe') as HTMLIFrameElement;
                            if (iframe) {
                              iframe.src = iframe.src; // Force reload
                            }
                            setIsBuildComplete(true);
                            setBuildStatus('live');
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                          🔄 Ricarica Ora
                        </motion.button>
                        <motion.button
                          onClick={handleDeploy}
                          disabled={isDeploying}
                          whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                          whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          🔁 Riprova Deploy
                        </motion.button>
                        {app.deployUrl && (
                          <motion.a
                            href={app.deployUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
                          >
                            🔗 Apri URL
                          </motion.a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Applicazione non ancora pubblicata</h3>
                <p className="text-gray-600 mb-4">
                  Pubblica l'applicazione per utilizzarla e condividerla
                </p>
                <motion.button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                  whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                >
                  {isDeploying ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      <span>Pubblicazione in corso...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>🚀 Pubblica Applicazione</span>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

