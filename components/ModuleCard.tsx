'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

interface ModuleCardProps {
  id: string;
  name: string;
  slug: string;
  type?: string;
  status: 'dev' | 'staging' | 'prod' | 'draft';
  lastModified: string;
  previewUrl?: string;
}

const statusColors = {
  dev: 'bg-blue-100 text-blue-700 border-blue-200',
  staging: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  prod: 'bg-green-100 text-green-700 border-green-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
};

const statusLabels = {
  dev: 'DEV',
  staging: 'STAGING',
  prod: 'PROD',
  draft: 'DRAFT',
};

export default function ModuleCard({
  id,
  name,
  slug,
  type,
  status,
  lastModified,
  previewUrl,
}: ModuleCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Oggi';
    if (days === 1) return 'Ieri';
    if (days < 7) return `${days} giorni fa`;
    if (days < 30) return `${Math.floor(days / 7)} settimane fa`;
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <Link href={`/workspace/${id}`}>
      <motion.div
        whileHover={{ scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
        className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all border border-gray-200 overflow-hidden cursor-pointer group"
      >
        {/* Preview Thumbnail */}
        <div className="relative h-48 bg-gradient-to-br from-blue-50 to-indigo-50 overflow-hidden">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0 pointer-events-none scale-50 origin-top-left"
              style={{ width: '200%', height: '200%' }}
              title={`Preview ${name}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Nessuna preview</p>
              </div>
            </div>
          )}
          {/* Status Badge */}
          <div className="absolute top-3 right-3">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[status]}`}>
              {statusLabels[status]}
            </span>
          </div>
        </div>

        {/* Card Content */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors mb-1">
                {name}
              </h3>
              {type && (
                <p className="text-sm text-gray-500 capitalize">{type}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDate(lastModified)}</span>
            </div>
            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

