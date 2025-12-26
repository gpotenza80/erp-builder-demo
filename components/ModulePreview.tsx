'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ModulePreviewProps {
  deployUrl?: string;
  moduleName: string;
  environment: 'dev' | 'staging' | 'prod';
}

export default function ModulePreview({
  deployUrl,
  moduleName,
  environment,
}: ModulePreviewProps) {
  const [useFakeData, setUseFakeData] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);

  if (!deployUrl) {
    return (
      <div className="w-full h-[700px] bg-gray-100 rounded-lg border border-gray-300 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 font-medium mb-2">Nessuna preview disponibile</p>
          <p className="text-sm text-gray-500">
            Deploya il modulo in {environment.toUpperCase()} per vedere l'anteprima
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useFakeData}
              onChange={(e) => setUseFakeData(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Usa dati di esempio</span>
          </label>
        </div>
        <button
          onClick={() => setShowExplainer(!showExplainer)}
          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showExplainer ? 'Nascondi' : 'Mostra'} AI Explainer
        </button>
      </div>

      <div className="relative bg-gray-100 rounded-lg border border-gray-300 overflow-hidden">
        {/* Iframe */}
        <iframe
          src={deployUrl}
          className="w-full h-[700px] border-0"
          title={`Preview ${moduleName}`}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-navigation"
        />

        {/* AI Explainer Sidebar */}
        <AnimatePresence>
          {showExplainer && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 w-96 h-full bg-white shadow-2xl border-l border-gray-200 overflow-y-auto z-10"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-800">AI Explainer</h3>
                  <button
                    onClick={() => setShowExplainer(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 mb-2">📊 Funzionalità Principali</h4>
                    <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                      <li>Gestione dati completa</li>
                      <li>Interfaccia intuitiva</li>
                      <li>Validazione automatica</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="font-semibold text-green-800 mb-2">🔗 Collegamenti</h4>
                    <p className="text-sm text-green-700">
                      Questo modulo può essere collegato ad altri moduli per creare un sistema integrato.
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-semibold text-purple-800 mb-2">💡 Suggerimenti</h4>
                    <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                      <li>Usa i dati di esempio per testare senza modificare dati reali</li>
                      <li>Collega questo modulo ad altri per creare workflow completi</li>
                      <li>Modifica il modulo usando l'Editor AI per aggiungere funzionalità</li>
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

