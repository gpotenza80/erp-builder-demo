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
                href="/dashboard"
                className="text-sm text-gray-600 hover:text-blue-600 transition-colors font-medium"
              >
                🎯 Dashboard Moduli
              </Link>
              <span className="text-sm text-gray-400">|</span>
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
            Costruisci il tuo ERP modulare con l'AI
          </h1>
          <p className="text-2xl text-gray-600 mb-8">
            Crea moduli personalizzati, collegali automaticamente, modifica in tempo reale
          </p>
          
          {/* USP Bullets */}
          <div className="max-w-3xl mx-auto mb-8">
            <div className="grid md:grid-cols-2 gap-4 text-left">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🧩</span>
                <div>
                  <span className="font-semibold text-gray-900">Moduli componibili</span>
                  <p className="text-gray-600 text-sm">Ordini, Clienti, Prodotti...</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🔗</span>
                <div>
                  <span className="font-semibold text-gray-900">Collegamenti automatici</span>
                  <p className="text-gray-600 text-sm">Tra moduli</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✏️</span>
                <div>
                  <span className="font-semibold text-gray-900">Modifica con linguaggio naturale</span>
                  <p className="text-gray-600 text-sm">Descrivi le modifiche in italiano</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🚀</span>
                <div>
                  <span className="font-semibold text-gray-900">Deploy quando sei pronto</span>
                  <p className="text-gray-600 text-sm">Pubblica l'intero sistema</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex gap-4 justify-center">
            <Link
              href="/dashboard"
              className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-lg transition-colors shadow-lg"
            >
              Inizia a Costruire →
            </Link>
          </div>
        </div>

        {/* Example Cards */}
        <div className="max-w-6xl mx-auto mb-12">
          <h2 className="text-3xl font-bold text-center mb-8 text-gray-900">
            Esempi di Moduli ERP
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-xl font-semibold mb-2">Modulo: Gestione Inventario</h3>
              <p className="text-gray-600 text-sm">
                Traccia prodotti, giacenze, movimenti di magazzino e scorte in tempo reale.
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-xl font-semibold mb-2">Modulo: CRM Aziendale</h3>
              <p className="text-gray-600 text-sm">
                Gestisci clienti, contatti, opportunità e pipeline di vendita.
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold mb-2">Modulo: Contabilità e Fatturazione</h3>
              <p className="text-gray-600 text-sm">
                Emetti fatture, gestisci pagamenti e monitora la contabilità.
              </p>
            </div>
          </div>
        </div>

        {/* Come funziona */}
        <div className="bg-blue-50 rounded-xl p-8 max-w-4xl mx-auto mb-12">
          <h3 className="text-2xl font-semibold mb-6 text-center">💡 Come funziona?</h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl mb-3">1️⃣</div>
              <span className="font-semibold text-lg block mb-2">Crea moduli</span>
              <p className="text-gray-700 text-sm">
                Descrivi cosa ti serve (es: gestione ordini) e l'AI crea il modulo completo
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">2️⃣</div>
              <span className="font-semibold text-lg block mb-2">Collega e modifica</span>
              <p className="text-gray-700 text-sm">
                L'AI collega i moduli automaticamente e applica le tue modifiche in tempo reale
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-3">3️⃣</div>
              <span className="font-semibold text-lg block mb-2">Deploy il tuo ERP</span>
              <p className="text-gray-700 text-sm">
                Quando sei pronto, pubblichi l'intero sistema su Vercel
              </p>
            </div>
          </div>
        </div>

        {/* Apps List (backward compatibility) */}
        <div className="max-w-4xl mx-auto">
          <AppsList />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-20">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-gray-500 text-sm">
            © 2024 ERP Builder AI - Trasforma le idee in software modulare
          </p>
        </div>
      </footer>
    </main>
  );
}
