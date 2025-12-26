import AIPromptBuilder from '@/components/AIPromptBuilder';
import AppsList from '@/components/AppsList';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg"></div>
              <span className="text-xl font-bold">ERP Builder AI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/apps"
                className="text-sm text-gray-600 hover:text-blue-600 transition-colors font-medium"
              >
                📋 App Generate
              </Link>
              <span className="text-sm text-gray-400">|</span>
              <div className="text-sm text-gray-600">
                Powered by Claude AI
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Crea il tuo ERP in 3 minuti
          </h1>
          <p className="text-2xl text-gray-600 mb-4">
            Descrivi cosa ti serve, l'AI genera l'applicazione
          </p>
          <p className="text-lg text-gray-500">
            Niente codice, niente complicazioni. Solo italiano.
          </p>
        </div>

        <div className="max-w-4xl mx-auto space-y-8">
          {/* AI Prompt Interface */}
          <AIPromptBuilder />

          {/* Apps List */}
          <AppsList />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-20">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-500 text-sm">
            © 2024 ERP Builder AI - Trasforma le idee in software
          </p>
        </div>
      </footer>
    </main>
  );
}

