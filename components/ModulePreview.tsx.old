'use client';

interface ModulePreviewProps {
  deployUrl?: string | null;
  status?: string;
}

export default function ModulePreview({ deployUrl, status }: ModulePreviewProps) {
  if (!deployUrl) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center">
        <div className="text-6xl mb-4">🚀</div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          Nessun deployment ancora
        </h3>
        <p className="text-gray-600">
          Genera o modifica il modulo per vedere la preview
        </p>
      </div>
    );
  }

  const isDeploying = status === 'deploying';

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {isDeploying && (
        <div className="bg-yellow-50 border-b border-yellow-200 p-4 text-center">
          <span className="text-yellow-800 text-sm font-medium">
            ⏳ Deployment in corso... Ricarica tra qualche minuto
          </span>
        </div>
      )}
      
      <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
        <span className="text-sm text-gray-600">Preview Live (DEV)</span>
        <a
          href={deployUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          Apri in nuova tab ↗
        </a>
      </div>
      
      <div className="relative" style={{ height: '700px' }}>
        <iframe
          src={deployUrl}
          className="w-full h-full border-0"
          title="Module Preview"
        />
      </div>
    </div>
  );
}
