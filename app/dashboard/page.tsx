'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Workspace, Module } from '@/lib/supabase/schema';

export default function DashboardPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkspaceAndModules();
  }, []);

  async function loadWorkspaceAndModules() {
    try {
      // Usa API route invece di Supabase client diretto per evitare problemi con variabili d'ambiente
      const workspaceResponse = await fetch('/api/workspaces');
      const workspaceData = await workspaceResponse.json();

      let currentWorkspace: Workspace | null = null;

      if (workspaceData.success && workspaceData.workspaces?.length > 0) {
        currentWorkspace = workspaceData.workspaces[0];
      } else {
        // Crea workspace di default se non esiste
        const createResponse = await fetch('/api/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: 'default_user',
            name: 'My ERP Workspace',
            description: 'Il mio workspace ERP personalizzato'
          }),
        });
        const createData = await createResponse.json();
        
        if (createData.success) {
          currentWorkspace = createData.workspace;
        }
      }

      if (currentWorkspace) {
        setWorkspace(currentWorkspace);

        // Carica moduli del workspace
        const modulesResponse = await fetch(`/api/workspaces/${currentWorkspace.id}/modules`);
        const modulesData = await modulesResponse.json();

        if (modulesData.success) {
          setModules(modulesData.modules || []);
        } else {
          setModules([]);
        }
      }
    } catch (error) {
      console.error('[Dashboard] Errore:', error);
      setModules([]);
    } finally {
      setLoading(false);
    }
  }

  function getEnvironmentBadge(module: Module) {
    if (module.prod_version_id) return { label: 'PROD', color: 'bg-green-500' };
    if (module.staging_version_id) return { label: 'STAGING', color: 'bg-yellow-500' };
    if (module.dev_version_id) return { label: 'DEV', color: 'bg-blue-500' };
    return { label: 'DRAFT', color: 'bg-gray-400' };
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Caricamento workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {workspace?.name || 'ERP Builder'}
            </h1>
            <p className="text-sm text-gray-600">
              {workspace?.description || 'Workspace modulare'}
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Torna alla home
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">I Tuoi Moduli</h2>
            <p className="text-sm text-gray-600">
              {modules.length} modulo{modules.length !== 1 ? 'i' : ''} nel workspace
            </p>
          </div>
          <Link
            href="/workspace/new"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <span>+</span>
            Nuovo Modulo
          </Link>
        </div>

        {/* Modules Grid */}
        {modules.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-300 p-12 text-center"
          >
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              Nessun modulo ancora
            </h3>
            <p className="text-gray-600 mb-6">
              Crea il tuo primo modulo ERP per iniziare
            </p>
            <Link
              href="/workspace/new"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Crea Primo Modulo
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((module, index) => {
              const badge = getEnvironmentBadge(module);
              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link href={`/workspace/${module.id}`}>
                    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-200 p-6 cursor-pointer">
                      <div className="flex items-start justify-between mb-4">
                        <div className="text-4xl">
                          {module.icon || '📦'}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {module.name}
                      </h3>
                      
                      {module.description && (
                        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                          {module.description}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {new Date(module.updated_at).toLocaleDateString('it-IT')}
                        </span>
                        <span className="text-blue-600 font-medium">
                          Apri →
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
