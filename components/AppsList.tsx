'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

interface App {
  id: string;
  prompt: string;
  created_at: string;
  filesCount: number;
  deployUrl?: string;
}

export default function AppsList() {
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Timeout di 5 secondi (ridotto per risposta più veloce)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/api/apps', {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        // Se l'API restituisce errore, prova comunque a parsare la risposta
        try {
          const errorData = await response.json();
          if (errorData.success === false) {
            // Se l'API dice che non ci sono app, restituisci array vuoto
            if (errorData.error?.includes('non esiste') || errorData.error?.includes('does not exist')) {
              setApps([]);
              setIsLoading(false);
              return;
            }
            setError(errorData.error || 'Errore nel caricamento delle app');
          } else {
            setApps(errorData.apps || []);
          }
        } catch {
          // Se non riesce a parsare, restituisci array vuoto
          setApps([]);
        }
        setIsLoading(false);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        setApps(data.apps || []);
      } else {
        // Anche se success è false, prova a usare apps se disponibile
        setApps(data.apps || []);
        if (data.error && !data.apps) {
          setError(data.error);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('[AppsList] Timeout caricamento app');
        // In caso di timeout, mostra array vuoto invece di errore
        setApps([]);
      } else {
        console.error('[AppsList] Errore caricamento app:', err);
        // In caso di errore generico, mostra array vuoto invece di errore
        setApps([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm('Sei sicuro di voler cancellare questa app?')) {
      return;
    }

    setDeletingId(appId);
    
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
        setApps(apps.filter(app => app.id !== appId));
      } else {
        alert(`Errore: ${data.error}`);
      }
    } catch (err) {
      alert(`Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`);
    } finally {
      setDeletingId(null);
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
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
        />
        <p className="text-gray-600">Caricamento app...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
          <button
            onClick={loadApps}
            className="ml-auto px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  // Se non ci sono app e non c'è loading/error, non mostrare nulla
  if (apps.length === 0 && !isLoading && !error) {
    return null;
  }
  
  // Se c'è un errore ma non è critico, mostra comunque la lista vuota
  if (error && apps.length === 0) {
    // Non mostrare errore se è solo un problema di tabella non esistente
    if (error.includes('non esiste') || error.includes('does not exist')) {
      return null;
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Le tue App Generate</h2>
          <p className="text-sm text-gray-600">
            {apps.length} {apps.length === 1 ? 'app generata' : 'app generate'}
          </p>
        </div>
        <Link
          href="/apps"
          className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Vedi tutte →
        </Link>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {apps.slice(0, 5).map((app) => (
            <Link key={app.id} href={`/apps/${app.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                whileHover={{ scale: 1.01 }}
                className="flex items-start justify-between gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 hover:border-blue-300 transition-all cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex-shrink-0"></div>
                    <h3 className="font-medium text-gray-800 truncate">
                      {app.prompt.substring(0, 60)}
                      {app.prompt.length > 60 ? '...' : ''}
                    </h3>
                  </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                  <span>Creata il {formatDate(app.created_at)}</span>
                  {app.deployUrl && (
                    <>
                      <span>•</span>
                      <span className="text-green-600 font-medium">Pubblicata</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(app.id);
                  }}
                  disabled={deletingId === app.id}
                  whileHover={{ scale: deletingId === app.id ? 1 : 1.05 }}
                  whileTap={{ scale: deletingId === app.id ? 1 : 0.95 }}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Cancella"
                >
                  {deletingId === app.id ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full"
                    />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </motion.button>
              </div>
            </motion.div>
            </Link>
          ))}
        </AnimatePresence>
      </div>

      {apps.length > 5 && (
        <div className="mt-4 text-center">
          <Link
            href="/apps"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Vedi altre {apps.length - 5} app →
          </Link>
        </div>
      )}
    </div>
  );
}

