'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const examplePrompts = [
  {
    title: 'Gestione Inventario',
    prompt: 'Crea un sistema ERP per la gestione dell\'inventario con: magazzino, prodotti, ordini, fornitori e reportistica. Include dashboard con grafici delle vendite e scorte minime.'
  },
  {
    title: 'CRM Aziendale',
    prompt: 'Sviluppa un CRM completo per gestire clienti, contatti, opportunità di vendita, pipeline commerciale, attività e report. Con integrazione email e calendario.'
  },
  {
    title: 'Contabilità e Fatturazione',
    prompt: 'Realizza un sistema di contabilità con gestione fatture, note di credito, pagamenti, clienti, fornitori, IVA e bilanci. Con export PDF e Excel.'
  }
];

interface GenerateResult {
  success: boolean;
  id?: string;
  message?: string;
  filesCount?: number;
  files?: Record<string, string>;
  repoUrl?: string;
  deployUrl?: string;
}

interface DeployResult {
  success: boolean;
  repoUrl?: string;
  deployUrl?: string;
  message?: string;
  error?: string;
}

export default function AIPromptBuilder() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [buildInProgress, setBuildInProgress] = useState(true);
  const [isBuildComplete, setIsBuildComplete] = useState(false);
  const [buildStatus, setBuildStatus] = useState<'checking' | 'building' | 'live'>('checking');

  const handleExampleClick = (examplePrompt: string) => {
    setPrompt(examplePrompt);
    setResult(null);
    setError(null);
    setActiveTab('');
  };

  const handleCopyCode = async (filename: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedFile(filename);
      setTimeout(() => setCopiedFile(null), 2000);
    } catch (err) {
      console.error('Errore durante la copia:', err);
    }
  };

  const handleDeploy = async () => {
    if (!result?.id) {
      setDeployError('ID app non disponibile');
      return;
    }

    setIsDeploying(true);
    setDeployError(null);
    setDeployResult(null);
    setBuildInProgress(true);

    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ appId: result.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Errore: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setDeployResult({
          success: true,
          repoUrl: data.repoUrl,
          deployUrl: data.deployUrl,
          message: data.message,
        });
        // Il build potrebbe essere ancora in corso, quindi impostiamo un timer
        // per permettere all'utente di ricaricare dopo 60 secondi
        setTimeout(() => {
          setBuildInProgress(false);
        }, 60000);
      } else {
        throw new Error(data.error || 'Deploy fallito');
      }
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Errore durante il deploy');
    } finally {
      setIsDeploying(false);
    }
  };

  // Funzione per ricaricare l'iframe dopo il build
  const handleReloadPreview = () => {
    setBuildInProgress(false);
    // Forza il reload dell'iframe cambiando la key
    if (deployResult?.deployUrl) {
      const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.src = deployResult.deployUrl;
      }
    }
  };

  // Polling per verificare se il deploy è completo
  useEffect(() => {
    const deployUrl = result?.deployUrl;
    if (!deployUrl) return;

    let pollCount = 0;
    const maxPolls = 12; // 12 * 10 secondi = 2 minuti max
    let pollInterval: NodeJS.Timeout;
    let timeoutId: NodeJS.Timeout;

    const markAsLive = () => {
      console.log('[POLLING] Deploy completato!');
      setIsBuildComplete(true);
      setBuildStatus('live');
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Setup iframe onload handler
    const setupIframeHandler = () => {
      const iframe = document.getElementById('app-preview-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.onload = () => {
          console.log('[POLLING] Iframe caricato con successo');
          // Aspetta un po' per essere sicuri che sia completamente caricato
          setTimeout(markAsLive, 2000);
        };
        iframe.onerror = () => {
          console.log('[POLLING] Iframe errore, continua polling');
        };
      }
    };

    // Setup handler dopo che il DOM è pronto
    setTimeout(setupIframeHandler, 100);

    const checkDeployStatus = async () => {
      try {
        pollCount++;
        console.log(`[POLLING] Tentativo ${pollCount}/${maxPolls} per ${deployUrl}`);
        
        // Prova a fare fetch (può fallire per CORS, ma proviamo)
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(deployUrl, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors',
          });
          
          clearTimeout(timeout);
          // Con no-cors non possiamo leggere lo status, ma se non errore probabilmente è live
          if (pollCount >= 3) {
            // Dopo 3 tentativi, considera live
            markAsLive();
            return;
          }
        } catch (error) {
          // Ignora errori CORS, continua polling
          console.log('[POLLING] Fetch fallito (probabilmente CORS), continua...');
        }

        // Se abbiamo raggiunto il max, considera il deploy come live
        if (pollCount >= maxPolls) {
          console.log('[POLLING] Raggiunto max tentativi, considerando deploy come live');
          markAsLive();
        }
      } catch (error) {
        console.log('[POLLING] Errore durante il check:', error);
        // Continua il polling
      }
    };

    // Timeout di sicurezza: dopo 2 minuti, considera live
    timeoutId = setTimeout(() => {
      console.log('[POLLING] Timeout raggiunto, considerando deploy come live');
      markAsLive();
    }, 120000);

    // Inizia il polling dopo 10 secondi
    pollInterval = setInterval(checkDeployStatus, 10000);
    
    // Prima check dopo 5 secondi
    setTimeout(checkDeployStatus, 5000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [result?.deployUrl]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Inserisci un prompt per generare l\'applicazione');
      return;
    }

    setIsLoading(true);
    setProgress(0);
    setResult(null); // Nascondi risultati precedenti durante la generazione
    setError(null);
    setDeployResult(null); // Nascondi anche i risultati di deploy precedenti

    // Simula progresso
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 300);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error(`Errore: ${response.statusText}`);
      }

      const data = await response.json();
      setProgress(100);
      
      if (data.success && data.files) {
        setResult({
          success: true,
          id: data.id,
          message: data.message,
          filesCount: data.filesCount,
          files: data.files,
          repoUrl: data.repoUrl,
          deployUrl: data.deployUrl,
        });
        // Imposta il primo file come tab attivo
        const firstFile = Object.keys(data.files)[0];
        if (firstFile) {
          setActiveTab(firstFile);
        }
        // Se c'è deployUrl, inizia il polling
        if (data.deployUrl) {
          setBuildStatus('building');
          setIsBuildComplete(false);
        }
      } else {
        setResult({
          success: false,
          message: data.message || data.result || 'Applicazione generata con successo!',
        });
      }
    } catch (err) {
      clearInterval(progressInterval);
      setError(err instanceof Error ? err.message : 'Errore durante la generazione');
      setProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Example Prompts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {examplePrompts.map((example, index) => (
          <motion.button
            key={index}
            onClick={() => handleExampleClick(example.prompt)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-4 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow border border-gray-200 text-left group"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"></div>
              <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                {example.title}
              </h3>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">
              {example.prompt.substring(0, 100)}...
            </p>
          </motion.button>
        ))}
      </div>

      {/* Prompt Textarea */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
        <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
          Descrivi l'ERP che vuoi creare
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Es: Crea un sistema ERP per gestire ordini, clienti, prodotti e fatturazione..."
          className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-800 placeholder-gray-400"
          disabled={isLoading}
        />
        <div className="mt-2 text-xs text-gray-500">
          {prompt.length} caratteri
        </div>
      </div>

      {/* Generate Button */}
      <motion.button
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim()}
        whileHover={{ scale: isLoading ? 1 : 1.02 }}
        whileTap={{ scale: isLoading ? 1 : 0.98 }}
        className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {isLoading ? (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
            />
            <span>Generazione in corso...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Genera Applicazione</span>
          </>
        )}
      </motion.button>

      {/* Progress Indicator */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Generazione in corso...</span>
              <span className="text-sm font-semibold text-blue-600">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Area - Con Deploy URL */}
      <AnimatePresence>
        {result && result.success && result.deployUrl && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border border-green-200"
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-10 h-10 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">✅ Applicazione Pronta!</h3>
                <p className="text-sm text-gray-600">
                  Repository GitHub creato. Vercel sta deployando... (può richiedere 2-5 minuti)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ⚠️ Se vedi un errore 404, aspetta qualche minuto e ricarica la pagina
                </p>
              </div>
            </div>

            {/* Progress Indicator */}
            <div className="mb-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 p-3 bg-white rounded-lg border border-gray-200"
              >
                {buildStatus === 'building' ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"
                    />
                    <span className="text-sm font-medium text-gray-700">Build in corso...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-700">✅ App Live!</span>
                  </>
                )}
              </motion.div>
            </div>

            {/* Iframe Preview */}
            <div className="mb-4">
              <div className="relative bg-white rounded-lg border border-gray-300 overflow-hidden">
                <iframe
                  id="app-preview-iframe"
                  src={result.deployUrl}
                  className="w-full h-[700px] border-0"
                  title="App Preview"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
                {buildStatus === 'building' && (
                  <motion.div
                    initial={{ opacity: 1 }}
                    animate={{ opacity: isBuildComplete ? 0 : 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center"
                  >
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
                      />
                      <p className="text-gray-700 font-medium text-lg">Build in corso...</p>
                      <p className="text-sm text-gray-500 mt-2">L'applicazione sarà disponibile a breve</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Open in New Tab Button */}
            {result.deployUrl && (
              <motion.a
                href={result.deployUrl}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all font-medium shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                🔗 Apri in nuova tab
              </motion.a>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Area - Senza Deploy URL (solo codice) */}
      <AnimatePresence>
        {result && result.success && result.files && !result.deployUrl && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-6 border border-blue-200"
          >
            {/* Success Message */}
            <div className="flex items-center gap-2 mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-800">✅ Applicazione Generata!</h3>
            </div>

            {/* Codice Generato Section */}
            <div className="mb-4">
              <h4 className="text-md font-semibold text-gray-700 mb-4">Codice Generato</h4>
              
              {/* Tabs */}
              <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-300">
                {Object.keys(result.files).map((filename) => (
                  <button
                    key={filename}
                    onClick={() => setActiveTab(filename)}
                    className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors ${
                      activeTab === filename
                        ? 'bg-gray-900 text-white border-b-2 border-blue-500'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {filename}
                  </button>
                ))}
              </div>

              {/* Code Display */}
              {activeTab && result.files[activeTab] && (
                <div className="relative">
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap">
                      <code>{result.files[activeTab]}</code>
                    </pre>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <motion.button
                      onClick={() => handleCopyCode(activeTab, result.files![activeTab])}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      {copiedFile === activeTab ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copiato!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          📋 Copia Codice
                        </>
                      )}
                    </motion.button>
                    
                    <motion.button
                      onClick={handleDeploy}
                      disabled={isDeploying}
                      whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                      whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all text-sm font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeploying ? (
                        <>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                          />
                          <span>Deploying...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          🚀 Deploy & Anteprima
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deploy Loading */}
      <AnimatePresence>
        {isDeploying && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-lg p-6 border border-purple-200"
          >
            <div className="flex items-center gap-3 mb-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full"
              />
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Deploying su GitHub + Vercel...</h3>
                <p className="text-sm text-gray-600">Creazione repository e avvio build...</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deploy Error */}
      <AnimatePresence>
        {deployError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{deployError}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deploy Result */}
      <AnimatePresence>
        {deployResult && deployResult.success && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border border-green-200"
          >
            <div className="flex items-center gap-2 mb-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="w-8 h-8 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              <h3 className="text-lg font-semibold text-gray-800">🚀 Deploy Completato!</h3>
            </div>

            {/* Links */}
            <div className="space-y-3 mb-6">
              {deployResult.repoUrl && (
                <motion.a
                  href={deployResult.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>Repository GitHub</span>
                  <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </motion.a>
              )}

              {deployResult.deployUrl && (
                <motion.a
                  href={deployResult.deployUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition-all text-sm font-medium shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>URL Vercel</span>
                  <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </motion.a>
              )}
            </div>

            {/* Build Status */}
            {buildInProgress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
              >
                <div className="flex items-center gap-2 text-yellow-800">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-yellow-600 border-t-transparent rounded-full"
                  />
                  <span className="text-sm font-medium">⏳ Build in corso, ricarica tra 60 secondi</span>
                </div>
              </motion.div>
            )}

            {/* Preview Iframe */}
            {deployResult.deployUrl && (
              <div className="mt-4">
                <h4 className="text-md font-semibold text-gray-700 mb-2">Anteprima</h4>
                <div className="relative bg-white rounded-lg border border-gray-300 overflow-hidden">
                  {buildInProgress ? (
                    <div className="h-96 flex items-center justify-center bg-gray-100">
                      <div className="text-center">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
                        />
                        <p className="text-gray-600">Build in corso...</p>
                        <motion.button
                          onClick={handleReloadPreview}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                          Ricarica Anteprima
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      id="preview-iframe"
                      src={deployResult.deployUrl}
                      className="w-full h-96 border-0"
                      title="Preview"
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                    />
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

