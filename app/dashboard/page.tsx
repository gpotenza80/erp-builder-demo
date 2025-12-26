'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import ModuleCard from '@/components/ModuleCard';

interface Workspace {
  id: string;
  name: string;
  user_id: string;
}

interface Module {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  status: 'dev' | 'staging' | 'prod' | 'draft';
  updated_at: string;
  dev_deploy_url?: string;
  staging_deploy_url?: string;
  prod_deploy_url?: string;
}

export default function DashboardPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Carica workspace (per ora: workspace unico)
      const workspaceResponse = await fetch('/api/workspaces');
      const workspaceData = await workspaceResponse.json();

      if (workspaceData.success && workspaceData.workspaces?.length > 0) {
        setWorkspace(workspaceData.workspaces[0]);
        
        // Carica moduli del workspace
        const modulesResponse = await fetch(`/api/workspaces/${workspaceData.workspaces[0].id}/modules`);
        const modulesData = await modulesResponse.json();

        if (modulesData.success) {
          setModules(modulesData.modules || []);
        }
      } else {
        // Se non ci sono workspace, crea uno di default
        const createResponse = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'default_user',
            name: 'My Workspace',
          }),
        });
        const createData = await createResponse.json();
        
        if (createData.success) {
          setWorkspace(createData.workspace);
          setModules([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateModule = () => {
    // TODO: Implementare creazione nuovo modulo
    window.location.href = '/dashboard?action=create-module';
  };

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

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md">
          <div className="text-red-600 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Errore</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadDashboard}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                {workspace?.name || 'Dashboard'}
              </h1>
              <p className="text-gray-600">
                Gestisci i tuoi moduli ERP in modo modulare e iterativo
              </p>
            </div>
            <motion.button
              onClick={handleCreateModule}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuovo Modulo
            </motion.button>
          </div>
        </div>

        {/* Modules Grid */}
        {modules.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-lg p-12 text-center"
          >
            <div className="w-24 h-24 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Nessun modulo ancora</h2>
            <p className="text-gray-600 mb-6">
              Crea il tuo primo modulo per iniziare a costruire il tuo sistema ERP modulare
            </p>
            <motion.button
              onClick={handleCreateModule}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-semibold inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Crea Primo Modulo
            </motion.button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module, index) => {
              // Determina status e preview URL
              let status: 'dev' | 'staging' | 'prod' | 'draft' = 'draft';
              let previewUrl: string | undefined;

              if (module.prod_deploy_url) {
                status = 'prod';
                previewUrl = module.prod_deploy_url;
              } else if (module.staging_deploy_url) {
                status = 'staging';
                previewUrl = module.staging_deploy_url;
              } else if (module.dev_deploy_url) {
                status = 'dev';
                previewUrl = module.dev_deploy_url;
              }

              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <ModuleCard
                    id={module.id}
                    name={module.name}
                    slug={module.slug}
                    type={module.type || undefined}
                    status={status}
                    lastModified={module.updated_at}
                    previewUrl={previewUrl}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

