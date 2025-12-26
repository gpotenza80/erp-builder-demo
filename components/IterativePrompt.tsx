'use client';

import { useState } from 'react';

interface IterativePromptProps {
  moduleId: string | null; // null = nuovo modulo
  currentVersion?: any;
  onGenerated?: (moduleId: string) => void;
}

export default function IterativePrompt({ 
  moduleId, 
  currentVersion,
  onGenerated 
}: IterativePromptProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!prompt.trim()) {
      setError('Inserisci una descrizione del modulo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = moduleId 
        ? `/api/modules/${moduleId}/modify`
        : '/api/modules/create';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Errore durante la generazione');
      }

      const data = await response.json();
      
      if (onGenerated && data.moduleId) {
        onGenerated(data.moduleId);
      }
      
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setLoading(false);
    }
  }

  const examplePrompts = moduleId ? [
    "Aggiungi campo sconto con validazione max 30%",
    "Collega questo modulo ai Clienti",
    "Aggiungi filtro per data",
  ] : [
    "Gestione ordini con cliente, data, importo, stato",
    "Anagrafica clienti con nome, email, telefono",
    "Magazzino prodotti con giacenza e prezzo",
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">
          {moduleId ? 'Modifica Modulo' : 'Descrivi il Modulo'}
        </h3>
        <p className="text-sm text-gray-600">
          {moduleId 
            ? 'Descrivi le modifiche che vuoi apportare al modulo'
            : 'Descrivi cosa deve fare il modulo in linguaggio naturale'
          }
        </p>
      </div>

      {/* Example prompts */}
      {!moduleId && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Esempi:</p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((example, i) => (
              <button
                key={i}
                onClick={() => setPrompt(example)}
                className="text-xs px-3 py-1 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={6}
          placeholder={moduleId 
            ? "Es: Aggiungi campo sconto con validazione massima 30%..."
            : "Es: Gestione ordini con cliente, prodotto, quantità, prezzo e stato..."
          }
          disabled={loading}
        />
        
        <div className="flex justify-between items-center mt-4">
          <span className="text-sm text-gray-500">
            {prompt.length} caratteri
          </span>
          
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                {moduleId ? 'Modificando...' : 'Generando...'}
              </span>
            ) : (
              moduleId ? '✏️ Modifica' : '🚀 Genera Modulo'
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </form>

      {currentVersion && (
        <div className="mt-6 pt-6 border-t">
          <p className="text-xs text-gray-500 mb-2">Versione attuale:</p>
          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
            "{currentVersion.prompt}"
          </p>
        </div>
      )}
    </div>
  );
}
