import Anthropic from '@anthropic-ai/sdk';
import * as esbuild from 'esbuild';

// Parsea la risposta di Claude per estrarre i file
export function parseClaudeResponse(response: string): Record<string, string> {
  const files: Record<string, string> = {};
  const filePattern = /=== FILENAME: (.+?) ===/g;
  const matches: Array<{ filename: string; startIndex: number; endIndex: number }> = [];
  
  // Trova tutti i match
  let match;
  while ((match = filePattern.exec(response)) !== null) {
    matches.push({
      filename: match[1].trim(),
      startIndex: match.index + match[0].length,
      endIndex: 0, // Sarà calcolato dopo
    });
  }

  // Estrai il contenuto per ogni file
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const endIndex = i < matches.length - 1 ? matches[i + 1].startIndex - matches[i + 1].filename.length - 20 : response.length;
    currentMatch.endIndex = endIndex;
    
    const content = response.substring(currentMatch.startIndex, currentMatch.endIndex).trim();
    // Rimuovi eventuali markdown code blocks
    const cleanedContent = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
    files[currentMatch.filename] = cleanedContent;
  }

  // Se non ci sono match con il pattern principale, prova pattern alternativi
  if (Object.keys(files).length === 0) {
    // Pattern alternativo 1: file con estensione seguito da contenuto
    const altPattern1 = /(?:^|\n)([\/\w\-\.]+\.(tsx?|jsx?|ts|js|json)):?\s*\n([\s\S]*?)(?=\n(?:[\/\w\-\.]+\.(?:tsx?|jsx?|ts|js|json)):|$)/g;
    let altMatch;
    while ((altMatch = altPattern1.exec(response)) !== null) {
      const filename = altMatch[1].trim();
      let content = altMatch[3].trim();
      // Rimuovi markdown code blocks
      content = content.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
      if (filename && content && content.length > 10) {
        files[filename] = content;
      }
    }
  }

  return files;
}

// Valida la sintassi dei file TypeScript/TSX usando esbuild
export async function validateSyntax(files: Record<string, string>): Promise<Array<{ file: string; message: string; location?: any }>> {
  const errors: Array<{ file: string; message: string; location?: any }> = [];
  const fileCount = Object.keys(files).length;
  const tsFiles = Object.entries(files).filter(([path]) => 
    path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js')
  );
  
  console.log(`[VALIDATION] Attempt: validating ${tsFiles.length} TypeScript/TSX files out of ${fileCount} total files...`);
  
  for (const [filePath, content] of tsFiles) {
    if (!content || content.trim().length === 0) {
      console.warn(`[VALIDATION] ⚠️  File vuoto: ${filePath}`);
      errors.push({
        file: filePath,
        message: 'File vuoto o contenuto mancante',
        location: null,
      });
      continue;
    }
    
    try {
      // Usa dynamic import per evitare problemi di bundling
      const esbuildModule = await import('esbuild');
      await esbuildModule.transform(content, {
        loader: filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'ts',
        target: 'es2020',
      });
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`[VALIDATION] ❌ Errore in ${filePath}:`, errorMessage);
      errors.push({
        file: filePath,
        message: errorMessage,
        location: error.location || null,
      });
    }
  }
  
  return errors;
}

// Valida e fixa il codice con retry fino a 3 tentativi
export async function validateAndFixCode(
  files: Record<string, string>,
  originalPrompt: string,
  anthropic: Anthropic,
  attempt: number = 1,
  startTime?: number
): Promise<{ success: boolean; files: Record<string, string>; errors?: Array<{ file: string; message: string }>; useFallback?: boolean; message?: string }> {
  const validationStartTime = startTime || Date.now();
  const totalElapsed = Date.now() - validationStartTime;
  
  // Timeout totale di 3 minuti per validation + fix
  if (totalElapsed > 180000) {
    console.error('[VALIDATION] ❌ Timeout totale (3 minuti) raggiunto. Using fallback template.');
    return {
      success: false,
      files: getSafeTemplate(originalPrompt),
      useFallback: true,
      errors: [],
      message: 'Timeout: validazione e fix hanno superato i 3 minuti totali',
    };
  }
  
  console.log(`[VALIDATION] Attempt ${attempt}: validating ${Object.keys(files).length} files...`);
  
  const errors = await validateSyntax(files);
  
  if (errors.length === 0) {
    console.log(`[VALIDATION] ✅ Code valid after ${attempt} attempt${attempt > 1 ? 's' : ''}!`);
    return { success: true, files };
  }
  
  console.log(`[VALIDATION] Found ${errors.length} errors in files:`, errors.map(e => e.file).join(', '));
  errors.forEach(e => {
    console.log(`  - ${e.file}: ${e.message}`);
  });
  
  if (attempt >= 3) {
    console.error('[VALIDATION] ❌ Max attempts reached (3). Using fallback template.');
    return {
      success: false,
      files: getSafeTemplate(originalPrompt),
      useFallback: true,
      errors,
      message: 'Impossibile generare codice valido dopo 3 tentativi',
    };
  }
  
  // Rigenera con context dell'errore
  console.log(`[FIX] Calling Claude to regenerate (attempt ${attempt + 1}/3)...`);
  const fixPrompt = `CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. You MUST generate COMPLETE, COMPILABLE code
2. NEVER leave code incomplete or with placeholders
3. ALL type definitions must be complete:
   ❌ BAD: stato: 'bozza' |
   ✅ GOOD: stato: 'bozza' | 'confermato' | 'spedito'
4. ALL JSX tags must be properly closed
5. ALL functions must have complete implementations
6. NO comments like '// ... rest of code'
7. Test mentally that code compiles before responding

If you're unsure, prefer SIMPLE working code over complex broken code.

---

Il codice precedente aveva questi errori:
${errors.map(e => `- ${e.file}: ${e.message}`).join('\n')}

Prompt originale: ${originalPrompt}

RIGENERA il codice COMPLETO fixando questi errori.
ASSICURATI che:
- Tutti i type union siano completi
- Tutte le funzioni abbiano chiusura corretta
- Niente codice incompleto
- Tutti gli import siano corretti
- Tutti i componenti React siano validi
- Tutti i tag JSX siano chiusi correttamente
- Tutti i tipi TypeScript siano definiti correttamente

Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;

  try {
    // Timeout di 2 minuti per ogni chiamata Claude
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout: fix generation ha superato i 2 minuti'));
      }, 120000); // 2 minuti
    });

    const message = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: fixPrompt,
          },
        ],
      }),
      timeoutPromise,
    ]);

    const responseText = message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      })
      .join('\n');

    const fixedFiles = parseClaudeResponse(responseText);
    console.log(`[FIX] File rigenerati: ${Object.keys(fixedFiles).length}`);

    if (Object.keys(fixedFiles).length === 0) {
      console.error('[FIX] ❌ Nessun file nella risposta di fix. Usando fallback.');
      return {
        success: false,
        files: getSafeTemplate(originalPrompt),
        useFallback: true,
        errors,
        message: 'Nessun file generato nella risposta di fix',
      };
    }

    // Retry validation ricorsivamente
    return validateAndFixCode(fixedFiles, originalPrompt, anthropic, attempt + 1, validationStartTime);
  } catch (error) {
    console.error('[FIX] ❌ Errore durante rigenerazione:', error);
    
    // Se è un timeout e abbiamo ancora tentativi, possiamo riprovare
    if (error instanceof Error && error.message.includes('Timeout') && attempt < 3) {
      console.log(`[FIX] Timeout, ma abbiamo ancora tentativi. Riprovo...`);
      return validateAndFixCode(files, originalPrompt, anthropic, attempt + 1, validationStartTime);
    }
    
    return {
      success: false,
      files: getSafeTemplate(originalPrompt),
      useFallback: true,
      errors,
      message: error instanceof Error ? error.message : 'Errore sconosciuto durante rigenerazione',
    };
  }
}

// Crea file base necessari per Next.js
export function getBaseFiles() {
  // Usiamo Next.js 15.1.9 (patch version) invece di versioni più vecchie perché:
  // - Include fix per la vulnerabilità CVE-2025-66478
  // - È l'ultima versione stabile senza vulnerabilità note
  // - Mantiene compatibilità con React 19 e le ultime features
  // - È la versione patchata più recente e stabile della serie 15.1.x
  // 
  // Usiamo ^ (caret) per permettere auto-update a patch di sicurezza
  // Esempio: ^15.1.9 accetta 15.1.x e 15.2.x ma non 16.x
  // Questo permette aggiornamenti automatici di patch e minor version senza breaking changes
  const packageJson = {
    name: 'erp-generated-app',
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'eslint',
    },
    dependencies: {
      next: '^15.1.9',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      '@supabase/supabase-js': '^2.89.0',
      'framer-motion': '^12.23.26',
    },
    devDependencies: {
      '@tailwindcss/postcss': '^4',
      '@types/node': '^20',
      '@types/react': '^19',
      '@types/react-dom': '^19',
      'eslint': '^9',
      'eslint-config-next': '^15.1.9',
      'typescript': '^5',
    },
  };

  return {
    'package.json': JSON.stringify(packageJson, null, 2),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2017',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'react-jsx',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: {
          '@/*': ['./*'],
        },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', '**/*.mts'],
      exclude: ['node_modules'],
    }, null, 2),
    'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

module.exports = nextConfig;`,
    'tailwind.config.ts': `import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;`,
    'postcss.config.js': `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

module.exports = config;`,
    '.gitignore': `# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*

# testing
/coverage

# next.js
/.next/
/out/

# production
/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# env files
.env*
.env.local
.env.development.local
.env.test.local
.env.production.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts`,
    'README.md': `# ERP Generated App

This application was generated using ERP Builder AI.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.`,
    'app/globals.css': `@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}`,
    'app/layout.tsx': `import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ERP Generated App",
  description: "Generated by ERP Builder AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={\`\${geistSans.variable} \${geistMono.variable}\`}>
        {children}
      </body>
    </html>
  );
}`,
  };
}

// Template ORDERS: Gestione ordini
export function getOrdersTemplate(): Record<string, string> {
  return {
    'app/page.tsx': `'use client';

import { useState } from 'react';
import OrderForm from '@/components/OrderForm';

interface Order {
  id: string;
  cliente: string;
  data: string;
  importo: number;
  stato: 'bozza' | 'confermato' | 'spedito';
}

export default function Home() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [showForm, setShowForm] = useState(false);

  const handleAddOrder = (orderData: Omit<Order, 'id'>) => {
    const newOrder: Order = {
      id: Date.now().toString(),
      ...orderData,
    };
    setOrders([...orders, newOrder]);
    setShowForm(false);
  };

  const getStatusColor = (stato: Order['stato']) => {
    switch (stato) {
      case 'bozza':
        return 'bg-gray-100 text-gray-800';
      case 'confermato':
        return 'bg-blue-100 text-blue-800';
      case 'spedito':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalImporto = orders.reduce((sum, order) => sum + order.importo, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestione Ordini</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Annulla' : '+ Nuovo Ordine'}
          </button>
        </div>

        {showForm && (
          <div className="mb-6">
            <OrderForm onSubmit={handleAddOrder} />
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Ordini ({orders.length})</h2>
            <div className="text-lg font-bold text-blue-600">
              Totale: €{totalImporto.toFixed(2)}
            </div>
          </div>

          {orders.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nessun ordine. Crea il primo ordine!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Cliente</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Data</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Importo</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{order.cliente}</td>
                      <td className="px-4 py-3 text-sm">{new Date(order.data).toLocaleDateString('it-IT')}</td>
                      <td className="px-4 py-3 text-sm font-medium">€{order.importo.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={\`px-2 py-1 rounded-full text-xs font-medium \${getStatusColor(order.stato)}\`}>
                          {order.stato.charAt(0).toUpperCase() + order.stato.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`,
    'components/OrderForm.tsx': `'use client';

import { useState } from 'react';

interface Order {
  id: string;
  cliente: string;
  data: string;
  importo: number;
  stato: 'bozza' | 'confermato' | 'spedito';
}

interface OrderFormProps {
  onSubmit: (order: Omit<Order, 'id'>) => void;
  initialData?: Order;
}

export default function OrderForm({ onSubmit, initialData }: OrderFormProps) {
  const [cliente, setCliente] = useState(initialData?.cliente || '');
  const [data, setData] = useState(initialData?.data || new Date().toISOString().split('T')[0]);
  const [importo, setImporto] = useState(initialData?.importo?.toString() || '');
  const [stato, setStato] = useState<Order['stato']>(initialData?.stato || 'bozza');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cliente.trim() || !importo) {
      alert('Compila tutti i campi obbligatori');
      return;
    }

    onSubmit({
      cliente: cliente.trim(),
      data,
      importo: parseFloat(importo),
      stato,
    });

    // Reset form
    setCliente('');
    setData(new Date().toISOString().split('T')[0]);
    setImporto('');
    setStato('bozza');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Nuovo Ordine</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Cliente *</label>
          <input
            type="text"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Nome cliente"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Data *</label>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Importo (€) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="0.00"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Stato *</label>
          <select
            value={stato}
            onChange={(e) => setStato(e.target.value as Order['stato'])}
            required
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="bozza">Bozza</option>
            <option value="confermato">Confermato</option>
            <option value="spedito">Spedito</option>
          </select>
        </div>
        
        <button
          type="submit"
          className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Salva Ordine
        </button>
      </div>
    </form>
  );
}`,
  };
}

// Template INVENTORY: Gestione magazzino e prodotti
export function getInventoryTemplate(): Record<string, string> {
  return {
    'app/page.tsx': `'use client';

import { useState } from 'react';
import ProductForm from '@/components/ProductForm';

interface Product {
  id: string;
  nome: string;
  categoria: string;
  quantita: number;
  prezzo: number;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);

  const handleAddProduct = (productData: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      id: Date.now().toString(),
      ...productData,
    };
    setProducts([...products, newProduct]);
    setShowForm(false);
  };

  const totalValue = products.reduce((sum, p) => sum + (p.quantita * p.prezzo), 0);
  const totalItems = products.reduce((sum, p) => sum + p.quantita, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestione Magazzino</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Annulla' : '+ Nuovo Prodotto'}
          </button>
        </div>

        {showForm && (
          <div className="mb-6">
            <ProductForm onSubmit={handleAddProduct} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Prodotti Totali</div>
            <div className="text-2xl font-bold">{products.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Pezzi in Stock</div>
            <div className="text-2xl font-bold text-blue-600">{totalItems}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Valore Totale</div>
            <div className="text-2xl font-bold text-green-600">€{totalValue.toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Prodotti ({products.length})</h2>

          {products.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nessun prodotto. Aggiungi il primo prodotto!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Nome</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Categoria</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Quantità</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Prezzo</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Valore</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{product.nome}</td>
                      <td className="px-4 py-3 text-sm">{product.categoria}</td>
                      <td className="px-4 py-3 text-sm">{product.quantita}</td>
                      <td className="px-4 py-3 text-sm">€{product.prezzo.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-medium">€{(product.quantita * product.prezzo).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`,
    'components/ProductForm.tsx': `'use client';

import { useState } from 'react';

interface Product {
  id: string;
  nome: string;
  categoria: string;
  quantita: number;
  prezzo: number;
}

interface ProductFormProps {
  onSubmit: (product: Omit<Product, 'id'>) => void;
  initialData?: Product;
}

export default function ProductForm({ onSubmit, initialData }: ProductFormProps) {
  const [nome, setNome] = useState(initialData?.nome || '');
  const [categoria, setCategoria] = useState(initialData?.categoria || '');
  const [quantita, setQuantita] = useState(initialData?.quantita?.toString() || '');
  const [prezzo, setPrezzo] = useState(initialData?.prezzo?.toString() || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nome.trim() || !categoria.trim() || !quantita || !prezzo) {
      alert('Compila tutti i campi obbligatori');
      return;
    }

    onSubmit({
      nome: nome.trim(),
      categoria: categoria.trim(),
      quantita: parseInt(quantita),
      prezzo: parseFloat(prezzo),
    });

    // Reset form
    setNome('');
    setCategoria('');
    setQuantita('');
    setPrezzo('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Nuovo Prodotto</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome Prodotto *</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Nome prodotto"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Categoria *</label>
          <input
            type="text"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Categoria"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Quantità *</label>
          <input
            type="number"
            min="0"
            value={quantita}
            onChange={(e) => setQuantita(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="0"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Prezzo (€) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={prezzo}
            onChange={(e) => setPrezzo(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="0.00"
          />
        </div>
        
        <button
          type="submit"
          className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Salva Prodotto
        </button>
      </div>
    </form>
  );
}`,
  };
}

// Template CUSTOMERS: Gestione clienti e fornitori
export function getCustomersTemplate(): Record<string, string> {
  return {
    'app/page.tsx': `'use client';

import { useState } from 'react';
import CustomerForm from '@/components/CustomerForm';

interface Customer {
  id: string;
  nome: string;
  email: string;
  telefono: string;
  indirizzo: string;
  tipo: 'cliente' | 'fornitore';
}

export default function Home() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<'tutti' | 'cliente' | 'fornitore'>('tutti');

  const handleAddCustomer = (customerData: Omit<Customer, 'id'>) => {
    const newCustomer: Customer = {
      id: Date.now().toString(),
      ...customerData,
    };
    setCustomers([...customers, newCustomer]);
    setShowForm(false);
  };

  const filteredCustomers = filterType === 'tutti' 
    ? customers 
    : customers.filter(c => c.tipo === filterType);

  const clientiCount = customers.filter(c => c.tipo === 'cliente').length;
  const fornitoriCount = customers.filter(c => c.tipo === 'fornitore').length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Gestione Clienti e Fornitori</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showForm ? 'Annulla' : '+ Nuovo Contatto'}
          </button>
        </div>

        {showForm && (
          <div className="mb-6">
            <CustomerForm onSubmit={handleAddCustomer} />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Totale Contatti</div>
            <div className="text-2xl font-bold">{customers.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Clienti</div>
            <div className="text-2xl font-bold text-blue-600">{clientiCount}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-600 mb-1">Fornitori</div>
            <div className="text-2xl font-bold text-green-600">{fornitoriCount}</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('tutti')}
              className={\`px-4 py-2 rounded-lg font-medium \${filterType === 'tutti' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}\`}
            >
              Tutti
            </button>
            <button
              onClick={() => setFilterType('cliente')}
              className={\`px-4 py-2 rounded-lg font-medium \${filterType === 'cliente' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}\`}
            >
              Solo Clienti
            </button>
            <button
              onClick={() => setFilterType('fornitore')}
              className={\`px-4 py-2 rounded-lg font-medium \${filterType === 'fornitore' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}\`}
            >
              Solo Fornitori
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Contatti ({filteredCustomers.length})</h2>

          {filteredCustomers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nessun contatto. Aggiungi il primo contatto!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{customer.nome}</h3>
                    <span className={\`px-2 py-1 rounded-full text-xs font-medium \${customer.tipo === 'cliente' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}\`}>
                      {customer.tipo === 'cliente' ? 'Cliente' : 'Fornitore'}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Email:</span>
                      <span>{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Telefono:</span>
                      <span>{customer.telefono}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Indirizzo:</span>
                      <span className="text-xs">{customer.indirizzo}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`,
    'components/CustomerForm.tsx': `'use client';

import { useState } from 'react';

interface Customer {
  id: string;
  nome: string;
  email: string;
  telefono: string;
  indirizzo: string;
  tipo: 'cliente' | 'fornitore';
}

interface CustomerFormProps {
  onSubmit: (customer: Omit<Customer, 'id'>) => void;
  initialData?: Customer;
}

export default function CustomerForm({ onSubmit, initialData }: CustomerFormProps) {
  const [nome, setNome] = useState(initialData?.nome || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [telefono, setTelefono] = useState(initialData?.telefono || '');
  const [indirizzo, setIndirizzo] = useState(initialData?.indirizzo || '');
  const [tipo, setTipo] = useState<Customer['tipo']>(initialData?.tipo || 'cliente');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nome.trim() || !email.trim() || !telefono.trim() || !indirizzo.trim()) {
      alert('Compila tutti i campi obbligatori');
      return;
    }

    onSubmit({
      nome: nome.trim(),
      email: email.trim(),
      telefono: telefono.trim(),
      indirizzo: indirizzo.trim(),
      tipo,
    });

    // Reset form
    setNome('');
    setEmail('');
    setTelefono('');
    setIndirizzo('');
    setTipo('cliente');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Nuovo Contatto</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nome *</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Nome completo"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Tipo *</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Customer['tipo'])}
            required
            className="w-full px-4 py-2 border rounded-lg"
          >
            <option value="cliente">Cliente</option>
            <option value="fornitore">Fornitore</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Email *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="email@esempio.com"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Telefono *</label>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="+39 123 456 7890"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">Indirizzo *</label>
          <textarea
            value={indirizzo}
            onChange={(e) => setIndirizzo(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg"
            rows={3}
            placeholder="Via, Città, CAP"
          />
        </div>
        
        <button
          type="submit"
          className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          Salva Contatto
        </button>
      </div>
    </form>
  );
}`,
  };
}

// Funzione per scegliere il template più appropriato basandosi sul prompt
export function selectTemplateByPrompt(prompt: string): 'orders' | 'inventory' | 'customers' {
  const lowerPrompt = prompt.toLowerCase();
  
  // Keywords per ORDERS
  const ordersKeywords = ['ordine', 'ordini', 'vendita', 'vendite', 'fattura', 'fatture', 'ordine cliente', 'ordini clienti'];
  // Keywords per INVENTORY
  const inventoryKeywords = ['magazzino', 'prodotto', 'prodotti', 'stock', 'inventario', 'scorta', 'merce'];
  // Keywords per CUSTOMERS
  const customersKeywords = ['cliente', 'clienti', 'fornitore', 'fornitori', 'contatto', 'contatti', 'rubrica'];
  
  // Conta le occorrenze
  const ordersScore = ordersKeywords.filter(kw => lowerPrompt.includes(kw)).length;
  const inventoryScore = inventoryKeywords.filter(kw => lowerPrompt.includes(kw)).length;
  const customersScore = customersKeywords.filter(kw => lowerPrompt.includes(kw)).length;
  
  // Scegli il template con il punteggio più alto
  if (inventoryScore > ordersScore && inventoryScore > customersScore) {
    return 'inventory';
  }
  if (customersScore > ordersScore && customersScore > inventoryScore) {
    return 'customers';
  }
  // Default a orders
  return 'orders';
}

// SAFE_TEMPLATE: Seleziona automaticamente il template più appropriato
export function getSafeTemplate(originalPrompt: string): Record<string, string> {
  const templateType = selectTemplateByPrompt(originalPrompt);
  console.log(`[FALLBACK] Using ${templateType.toUpperCase()} template after 3 failed attempts (prompt: "${originalPrompt.substring(0, 50)}...")`);
  
  switch (templateType) {
    case 'inventory':
      return getInventoryTemplate();
    case 'customers':
      return getCustomersTemplate();
    case 'orders':
    default:
      return getOrdersTemplate();
  }
}

