'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Module, ModuleVersion } from '@/lib/supabase/schema';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export default function WorkspacePage() {
  const params = useParams();
  const moduleId = params.moduleId as string;
  
  const [module, setModule] = useState<Module | null>(null);
  const [devVersion, setDevVersion] = useState<ModuleVersion | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<string>('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (moduleId && moduleId !== 'new') {
      loadModule();
    }
  }, [moduleId]);

  useEffect(() => {
    // Auto-scroll chat
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadModule() {
    try {
      const response = await fetch(`/api/modules/${moduleId}`);
      if (!response.ok) throw new Error('Errore caricamento modulo');
      
      const moduleData = await response.json();
      setModule(moduleData);

      if (moduleData?.dev_version_id) {
        const versionResponse = await fetch(`/api/module-versions/${moduleData.dev_version_id}`);
        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          setDevVersion(versionData);
          setPreviewUrl(versionData?.dev_deploy_url || null);
          setDeploymentStatus(versionData?.status || '');
          
          // Messaggio iniziale da AI
          if (messages.length === 0) {
            setMessages([{
              id: '1',
              role: 'assistant',
              content: `👋 Modulo "${moduleData.name}" caricato! Descrivi le modifiche che vuoi apportare.`,
              timestamp: new Date(),
            }]);
          }
        }
      }
    } catch (error) {
      console.error('[WORKSPACE] Errore caricamento modulo:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendMessage() {
    if (!inputValue.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsGenerating(true);

    // Loading message da AI
    const loadingMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '⏳ Sto modificando il modulo...',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const response = await fetch(`/api/modules/${moduleId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput }),
      });

      const data = await response.json();

      if (data.success) {
        // Rimuovi loading message
        setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
        
        // Aggiungi risposta AI
        const aiMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: `✅ Modifica applicata! ${data.explanation || 'File modificati con successo.'} La preview si sta aggiornando...`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);

        // Aggiorna preview
        await loadModule();
      } else {
        throw new Error(data.error || 'Errore durante modifica');
      }
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== loadingMessage.id));
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 3).toString(),
        role: 'assistant',
        content: `❌ Errore: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeployStaging() {
    if (!module) return;
    
    try {
      const response = await fetch(`/api/modules/${module.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: 'staging' }),
      });

      const data = await response.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `🚀 Deploy su Staging completato! URL: ${data.deployUrl || 'N/A'}`,
          timestamp: new Date(),
        }]);
        await loadModule();
      } else {
        throw new Error(data.error || 'Errore durante deploy staging');
      }
    } catch (error) {
      alert(`Errore deploy staging: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    }
  }

  async function handleDeployProduction() {
    if (!module) return;
    
    try {
      const response = await fetch(`/api/modules/${module.id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: 'production' }),
      });

      const data = await response.json();
      if (data.success) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ Deploy su Production completato! URL: ${data.deployUrl || 'N/A'}`,
          timestamp: new Date(),
        }]);
        await loadModule();
      } else {
        throw new Error(data.error || 'Errore durante deploy production');
      }
    } catch (error) {
      alert(`Errore deploy production: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!module) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Modulo non trovato</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Torna al dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {module.icon} {module.name}
            </h1>
            <p className="text-xs text-gray-500">
              Versione DEV v{devVersion?.version_number || 1}
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleDeployStaging}
            className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium"
          >
            🚀 Deploy Staging
          </button>
          <button
            onClick={handleDeployProduction}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            ✅ Deploy Production
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Chat AI */}
        <div className="w-1/2 border-r flex flex-col bg-white">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">💬 Editor AI</h2>
            <p className="text-sm text-gray-600">
              Descrivi le modifiche in linguaggio naturale
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'system'
                      ? 'bg-gray-100 text-gray-700 text-sm'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString('it-IT', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t bg-white">
            <div className="flex gap-2">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Es: Aggiungi campo sconto con validazione max 30%..."
                className="flex-1 px-4 py-3 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                disabled={isGenerating}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isGenerating}
                className="px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                {isGenerating ? '⏳' : '📤'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Premi Invio per inviare, Shift+Invio per andare a capo
            </p>
          </div>
        </div>

        {/* RIGHT: Live Preview */}
        <div className="w-1/2 flex flex-col bg-white">
          {/* Preview Header */}
          <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">👁️ Live Preview</h2>
              <p className="text-sm text-gray-600">
                Ambiente di sviluppo (modifiche in tempo reale)
              </p>
            </div>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
              >
                Apri in nuova tab ↗
              </a>
            )}
          </div>

          {/* Deployment Status Banner */}
          {deploymentStatus === 'deploying' && (
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
              <p className="text-sm text-blue-800">
                ⏳ Deployment in corso... Preview disponibile tra 2-3 minuti
              </p>
            </div>
          )}

          {deploymentStatus === 'failed' && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-3">
              <p className="text-sm text-red-800">
                ❌ Deployment fallito. Controlla i log.
              </p>
            </div>
          )}

          {/* Preview Iframe */}
          <div className="flex-1 relative">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Live Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-6xl mb-4">🚀</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    Nessun deployment ancora
                  </h3>
                  <p className="text-gray-600">
                    Usa la chat per creare o modificare il modulo
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
