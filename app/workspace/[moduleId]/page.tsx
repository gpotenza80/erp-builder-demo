'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Module, ModuleVersion } from '@/lib/supabase/schema';
import IterativePrompt from '@/components/IterativePrompt';
import ModulePreview from '@/components/ModulePreview';

type Tab = 'editor' | 'preview' | 'schema' | 'versions';

export default function WorkspacePage() {
  const params = useParams();
  const moduleId = params.moduleId as string;
  
  const [module, setModule] = useState<Module | null>(null);
  const [devVersion, setDevVersion] = useState<ModuleVersion | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (moduleId && moduleId !== 'new') {
      loadModule();
    } else {
      setLoading(false);
    }
  }, [moduleId]);

  async function loadModule() {
    try {
      // Usa API route invece di Supabase client diretto
      const moduleResponse = await fetch(`/api/modules/${moduleId}`);
      const moduleData = await moduleResponse.json();

      if (!moduleData.success || !moduleData.module) {
        console.error('[Workspace] Modulo non trovato');
        setLoading(false);
        return;
      }

      setModule(moduleData.module);

      // Carica versione DEV se esiste
      if (moduleData.module.dev_version_id) {
        const versionResponse = await fetch(`/api/module-versions/${moduleData.module.dev_version_id}`);
        const versionData = await versionResponse.json();

        if (versionData.success && versionData.version) {
          setDevVersion(versionData.version);
        }
      }
    } catch (error) {
      console.error('[Workspace] Errore:', error);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'editor', label: 'Editor AI', icon: '✏️' },
    { id: 'preview', label: 'Preview', icon: '👁️' },
    { id: 'schema', label: 'Schema', icon: '🗄️' },
    { id: 'versions', label: 'Versioni', icon: '📋' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Caso: Nuovo modulo
  if (moduleId === 'new') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            ← Torna al dashboard
          </Link>
          
          <h1 className="text-3xl font-bold mb-6">Crea Nuovo Modulo</h1>
          
          <IterativePrompt
            moduleId={null}
            onGenerated={(newModuleId) => {
              window.location.href = `/workspace/${newModuleId}`;
            }}
          />
        </div>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                ← Dashboard
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {module.icon} {module.name}
                </h1>
                {module.description && (
                  <p className="text-sm text-gray-600">{module.description}</p>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                💾 Salva Versione
              </button>
              <button className="px-4 py-2 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                🚀 Deploy Staging
              </button>
              <button className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">
                ✅ Deploy Production
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'editor' && (
          <IterativePrompt
            moduleId={moduleId}
            currentVersion={devVersion}
            onGenerated={loadModule}
          />
        )}
        
        {activeTab === 'preview' && (
          <ModulePreview
            deployUrl={devVersion?.dev_deploy_url}
            status={devVersion?.status}
          />
        )}
        
        {activeTab === 'schema' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Database Schema</h3>
            {devVersion?.database_schema ? (
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto">
                {JSON.stringify(devVersion.database_schema, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-600">Nessuno schema definito</p>
            )}
          </div>
        )}
        
        {activeTab === 'versions' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Storico Versioni</h3>
            <p className="text-gray-600">Storico versioni (da implementare)</p>
          </div>
        )}
      </div>
    </div>
  );
}
