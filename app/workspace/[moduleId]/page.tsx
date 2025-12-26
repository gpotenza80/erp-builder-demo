'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import IterativePrompt from '@/components/IterativePrompt';
import ModulePreview from '@/components/ModulePreview';

type Tab = 'editor' | 'preview' | 'schema' | 'connections' | 'versions';
type Environment = 'dev' | 'staging' | 'prod';

interface Module {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  description: string | null;
  dev_version_id: string | null;
  staging_version_id: string | null;
  prod_version_id: string | null;
}

interface ModuleVersion {
  id: string;
  version_number: number;
  prompt: string;
  status: string;
  dev_deploy_url: string | null;
  staging_deploy_url: string | null;
  prod_deploy_url: string | null;
  database_schema: any | null;
  created_at: string;
  created_by: string | null;
}

export default function WorkspaceModulePage() {
  const params = useParams();
  const router = useRouter();
  const moduleId = params.moduleId as string;

  const [module, setModule] = useState<Module | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [environment, setEnvironment] = useState<Environment>('dev');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<ModuleVersion | null>(null);
  const [versions, setVersions] = useState<ModuleVersion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (moduleId) {
      loadModule();
    }
  }, [moduleId]);

  const loadModule = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/modules/${moduleId}`);
      const data = await response.json();

      if (data.success && data.module) {
        setModule(data.module);
        
        // Carica versione corrente basata su environment
        const versionId = 
          environment === 'prod' ? data.module.prod_version_id :
          environment === 'staging' ? data.module.staging_version_id :
          data.module.dev_version_id;

        if (versionId) {
          await loadVersion(versionId);
        }

        // Carica tutte le versioni
        await loadVersions();
      } else {
        setError(data.error || 'Modulo non trovato');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setIsLoading(false);
    }
  };

  const loadVersion = async (versionId: string) => {
    try {
      const response = await fetch(`/api/module-versions/${versionId}`);
      const data = await response.json();
      if (data.success && data.version) {
        setCurrentVersion(data.version);
      }
    } catch (err) {
      console.error('Errore caricamento versione:', err);
    }
  };

  const loadVersions = async () => {
    try {
      const response = await fetch(`/api/modules/${moduleId}/versions`);
      const data = await response.json();
      if (data.success) {
        setVersions(data.versions || []);
      }
    } catch (err) {
      console.error('Errore caricamento versioni:', err);
    }
  };

  const handleModify = async (prompt: string) => {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/modules/${moduleId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, environment }),
      });

      const data = await response.json();
      if (data.success) {
        await loadModule();
        await loadVersions();
      } else {
        setError(data.error || 'Errore durante la modifica');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante la modifica');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeploy = async (targetEnv: 'staging' | 'prod') => {
    try {
      setIsDeploying(true);
      const response = await fetch(`/api/modules/${moduleId}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: targetEnv }),
      });

      const data = await response.json();
      if (data.success) {
        await loadModule();
      } else {
        setError(data.error || 'Errore durante il deploy');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il deploy');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleSaveVersion = async () => {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/modules/${moduleId}/save-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });

      const data = await response.json();
      if (data.success) {
        await loadModule();
        await loadVersions();
      } else {
        setError(data.error || 'Errore durante il salvataggio');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il salvataggio');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (module) {
      const versionId = 
        environment === 'prod' ? module.prod_version_id :
        environment === 'staging' ? module.staging_version_id :
        module.dev_version_id;

      if (versionId) {
        loadVersion(versionId);
      } else {
        setCurrentVersion(null);
      }
    }
  }, [environment, module]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Errore</h2>
          <p className="text-gray-600 mb-4">{error || 'Modulo non trovato'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Torna al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const getDeployUrl = () => {
    if (!currentVersion) return undefined;
    return environment === 'prod' ? currentVersion.prod_deploy_url || undefined :
           environment === 'staging' ? currentVersion.staging_deploy_url || undefined :
           currentVersion.dev_deploy_url || undefined;
  };

  const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    {
      id: 'editor',
      label: 'Editor AI',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>,
    },
    {
      id: 'preview',
      label: 'Preview',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>,
    },
    {
      id: 'schema',
      label: 'Schema',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>,
    },
    {
      id: 'connections',
      label: 'Connessioni',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>,
    },
    {
      id: 'versions',
      label: 'Versioni',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-600 hover:text-gray-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                type="text"
                value={module.name}
                onChange={(e) => {
                  // TODO: Implementare update nome modulo
                  setModule({ ...module, name: e.target.value });
                }}
                className="text-2xl font-bold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
              />
            </div>

            <div className="flex items-center gap-4">
              {/* Environment Selector */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                {(['dev', 'staging', 'prod'] as Environment[]).map((env) => (
                  <button
                    key={env}
                    onClick={() => setEnvironment(env)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      environment === env
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {env.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={handleSaveVersion}
                  disabled={isSaving}
                  whileHover={{ scale: isSaving ? 1 : 1.05 }}
                  whileTap={{ scale: isSaving ? 1 : 0.95 }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                      Salvataggio...
                    </>
                  ) : (
                    <>
                      💾 Salva versione
                    </>
                  )}
                </motion.button>

                {environment === 'dev' && (
                  <motion.button
                    onClick={() => handleDeploy('staging')}
                    disabled={isDeploying}
                    whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                    whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    🚀 Deploy to Staging
                  </motion.button>
                )}

                {environment === 'staging' && (
                  <motion.button
                    onClick={() => handleDeploy('prod')}
                    disabled={isDeploying}
                    whileHover={{ scale: isDeploying ? 1 : 1.05 }}
                    whileTap={{ scale: isDeploying ? 1 : 0.95 }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    ✅ Deploy to Production
                  </motion.button>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'editor' && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <IterativePrompt
                moduleId={moduleId}
                moduleName={module.name}
                connectedModules={[]} // TODO: Caricare moduli collegati
                promptHistory={versions.map(v => ({
                  id: v.id,
                  prompt: v.prompt,
                  created_at: v.created_at,
                  version_number: v.version_number,
                }))}
                onModify={handleModify}
                isLoading={isSaving}
              />
            </motion.div>
          )}

          {activeTab === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <ModulePreview
                deployUrl={getDeployUrl()}
                moduleName={module.name}
                environment={environment}
              />
            </motion.div>
          )}

          {activeTab === 'schema' && (
            <motion.div
              key="schema"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4">Database Schema</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-600">
                  {currentVersion?.database_schema 
                    ? JSON.stringify(currentVersion.database_schema, null, 2)
                    : 'Nessuno schema disponibile'}
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'connections' && (
            <motion.div
              key="connections"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4">Connessioni Moduli</h2>
              <p className="text-gray-600">Nessuna connessione configurata</p>
            </motion.div>
          )}

          {activeTab === 'versions' && (
            <motion.div
              key="versions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <h2 className="text-xl font-bold text-gray-800 mb-4">Storico Versioni</h2>
              <div className="space-y-3">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-800">
                        Versione {version.version_number}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(version.created_at).toLocaleString('it-IT')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{version.prompt}</p>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        version.status === 'deployed_prod' ? 'bg-green-100 text-green-700' :
                        version.status === 'deployed_staging' ? 'bg-yellow-100 text-yellow-700' :
                        version.status === 'deployed_dev' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {version.status}
                      </span>
                      {version.created_by && (
                        <span className="text-xs text-gray-500">{version.created_by}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

