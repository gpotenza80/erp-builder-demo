'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewModulePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examplePrompts = [
    "Gestione ordini con cliente, data, importo, stato",
    "Anagrafica clienti con nome, email, telefono",
    "Magazzino prodotti con giacenza e prezzo",
  ];

  async function handleCreate() {
    if (!prompt.trim()) {
      setError('Inserisci una descrizione del modulo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/modules/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Errore durante la creazione');
      }

      // Redirect al workspace del nuovo modulo
      router.push(`/workspace/${data.moduleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
          ← Torna al dashboard
        </Link>
        
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-2">Crea Nuovo Modulo ERP</h1>
          <p className="text-gray-600 mb-8">
            Descrivi cosa deve fare il modulo in linguaggio naturale
          </p>

          {/* Example prompts */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-3">Esempi rapidi:</p>
            <div className="flex flex-wrap gap-2">
              {examplePrompts.map((example, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(example)}
                  className="text-sm px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt input */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            rows={6}
            placeholder="Es: Gestione ordini con cliente, prodotto, quantità, prezzo e stato. Deve permettere di creare, modificare ed eliminare ordini..."
            disabled={loading}
          />

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {prompt.length} caratteri
            </span>
            
            <button
              onClick={handleCreate}
              disabled={loading || !prompt.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium text-lg"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Generando... (2-3 min)
                </span>
              ) : (
                '🚀 Crea Modulo'
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                Generando codice con AI...
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                Validando sintassi...
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                Deployando su GitHub...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

