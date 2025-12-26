'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConnectedModule {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface PromptHistory {
  id: string;
  prompt: string;
  created_at: string;
  version_number: number;
}

interface IterativePromptProps {
  moduleId: string;
  moduleName: string;
  connectedModules?: ConnectedModule[];
  promptHistory?: PromptHistory[];
  onModify: (prompt: string) => Promise<void>;
  isLoading?: boolean;
}

export default function IterativePrompt({
  moduleId,
  moduleName,
  connectedModules = [],
  promptHistory = [],
  onModify,
  isLoading = false,
}: IterativePromptProps) {
  const [prompt, setPrompt] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showContext, setShowContext] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    await onModify(prompt);
    setPrompt('');
  };

  const useHistoryPrompt = (historyPrompt: string) => {
    setPrompt(historyPrompt);
    setShowHistory(false);
  };

  return (
    <div className="space-y-6">
      {/* Context Info - Moduli Collegabili */}
      {showContext && connectedModules.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Moduli Collegabili
            </h3>
            <button
              onClick={() => setShowContext(false)}
              className="text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedModules.map((module) => (
              <span
                key={module.id}
                className="px-3 py-1 bg-white border border-blue-300 rounded-full text-xs font-medium text-blue-700"
              >
                {module.name}
              </span>
            ))}
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Puoi fare riferimento a questi moduli nel tuo prompt per creare connessioni
          </p>
        </motion.div>
      )}

      {/* Prompt History */}
      {promptHistory.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Cronologia Prompt ({promptHistory.length})
            </span>
            <svg
              className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2"
              >
                {promptHistory.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-300 transition-colors"
                    onClick={() => useHistoryPrompt(item.prompt)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500">
                        Versione {item.version_number}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('it-IT')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{item.prompt}</p>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Prompt Input */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
            Modifica Modulo: <span className="font-bold text-blue-600">{moduleName}</span>
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Es: Aggiungi campo 'note' alla tabella ordini, oppure: Collega questo modulo al modulo Clienti usando il campo cliente_id..."
            className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-800 placeholder-gray-400"
            disabled={isLoading}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">{prompt.length} caratteri</span>
            {!showContext && connectedModules.length > 0 && (
              <button
                type="button"
                onClick={() => setShowContext(true)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Mostra moduli collegabili
              </button>
            )}
          </div>
        </div>

        <motion.button
          type="submit"
          disabled={!prompt.trim() || isLoading}
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
              <span>Modifica in corso...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Modifica Modulo</span>
            </>
          )}
        </motion.button>
      </form>
    </div>
  );
}

