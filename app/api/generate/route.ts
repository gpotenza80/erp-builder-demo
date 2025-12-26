import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Octokit } from '@octokit/rest';
import { randomUUID } from 'crypto';

// Import dinamico di esbuild per evitare problemi con Next.js bundling
let esbuild: typeof import('esbuild') | null = null;
async function getEsbuild() {
  if (!esbuild) {
    esbuild = await import('esbuild');
  }
  return esbuild;
}

// Inizializza Supabase client
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  console.log('[SUPABASE] URL:', supabaseUrl ? 'trovato' : 'MANCANTE');
  console.log('[SUPABASE] KEY:', supabaseKey ? 'trovato' : 'MANCANTE');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials non configurate');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Crea la tabella se non esiste
async function ensureTableExists(supabase: any) {
  // Prova a creare la tabella con tutte le colonne necessarie (ignora se esiste già)
  const { error: createError } = await (supabase as any).rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS generated_apps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt TEXT NOT NULL,
        files JSONB NOT NULL,
        repoUrl TEXT,
        deployUrl TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
  });

  // Aggiungi colonne deployUrl e repoUrl se non esistono (per tabelle create prima)
  // Questo funziona solo se la funzione RPC exec_sql è disponibile
  const { error: alterError1 } = await (supabase as any).rpc('exec_sql', {
    sql: `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'generated_apps' AND column_name = 'deployurl'
        ) THEN
          ALTER TABLE generated_apps ADD COLUMN "deployUrl" TEXT;
        END IF;
      END $$;
    `
  });

  const { error: alterError2 } = await (supabase as any).rpc('exec_sql', {
    sql: `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'generated_apps' AND column_name = 'repourl'
        ) THEN
          ALTER TABLE generated_apps ADD COLUMN "repoUrl" TEXT;
        END IF;
      END $$;
    `
  });

  // Se la funzione RPC non esiste, prova un approccio alternativo
  // In produzione, la tabella dovrebbe essere creata manualmente o via migration
  // Gli errori vengono ignorati perché la tabella potrebbe già esistere o le colonne potrebbero già essere presenti
}

// Valida la sintassi del codice usando esbuild
// Valida la sintassi del codice usando esbuild
async function validateSyntax(files: Record<string, string>): Promise<Array<{ file: string; message: string; location?: any }>> {
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
      const esbuildModule = await getEsbuild();
      const loader = filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'ts';
      await esbuildModule.transform(content, {
        loader: loader as 'tsx' | 'ts',
        target: 'es2020',
        format: 'esm',
        jsx: 'automatic',
      });
      console.log(`[VALIDATION] ✅ ${filePath} - valid`);
    } catch (error: any) {
      // Formatta l'errore in modo chiaro
      let errorMessage = error.message || 'Errore sconosciuto';
      const errorLocation = error.location || null;
      
      // Estrai informazioni utili dall'errore
      if (errorLocation) {
        errorMessage = `${errorMessage} (line ${errorLocation.line}, column ${errorLocation.column})`;
      }
      
      // Rimuovi informazioni tecniche non necessarie
      errorMessage = errorMessage.replace(/^error: /i, '').trim();
      
      console.error(`[VALIDATION] ❌ ${filePath}: ${errorMessage}`);
      errors.push({
        file: filePath,
        message: errorMessage,
        location: errorLocation,
      });
    }
  }
  
  if (errors.length > 0) {
    console.log(`[VALIDATION] Found ${errors.length} errors in files:`, errors.map(e => e.file).join(', '));
  } else {
    console.log('[VALIDATION] ✅ All files valid!');
  }
  
  return errors;
}

// Template ORDERS: Gestione ordini e vendite
function getOrdersTemplate(): Record<string, string> {
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
function getInventoryTemplate(): Record<string, string> {
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
            <div className="text-sm text-gray-600 mb-1">Pezzi in Magazzino</div>
            <div className="text-2xl font-bold">{totalItems}</div>
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
                  {products.map((product) => {
                    const valore = product.quantita * product.prezzo;
                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{product.nome}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                            {product.categoria}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={\`px-2 py-1 rounded-full text-xs font-medium \${product.quantita < 10 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}\`}>
                            {product.quantita}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">€{product.prezzo.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-medium">€{valore.toFixed(2)}</td>
                      </tr>
                    );
                  })}
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
            placeholder="Nome del prodotto"
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
            placeholder="Es: Elettronica, Abbigliamento, etc."
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
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
function getCustomersTemplate(): Record<string, string> {
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
function selectTemplateByPrompt(prompt: string): 'orders' | 'inventory' | 'customers' {
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
function getSafeTemplate(originalPrompt: string): Record<string, string> {
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

// Valida e fixa il codice con retry fino a 3 tentativi
async function validateAndFixCode(
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

// Parsea la risposta di Claude per estrarre i file
function parseClaudeResponse(response: string): Record<string, string> {
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

// Inizializza GitHub client
function getGitHubClient() {
  const githubToken = process.env.GITHUB_TOKEN;
  
  console.log('[GENERATE] [GITHUB] TOKEN:', githubToken ? 'trovato' : 'MANCANTE');
  
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN non configurato');
  }

  return new Octokit({
    auth: githubToken,
  });
}

// Crea file base necessari per Next.js
function getBaseFiles() {
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
      <body
        className={\`\${geistSans.variable} \${geistMono.variable} antialiased\`}
      >
        {children}
      </body>
    </html>
  );
}`,
  };
}

// Funzione con retry logic per operazioni GitHub
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  operationName: string = 'Operation'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[GENERATE] [RETRY] ${operationName} - Tentativo ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[GENERATE] [RETRY] ${operationName} - Tentativo ${attempt} fallito:`, lastError.message);
      
      if (attempt < maxRetries) {
        const waitTime = delay * attempt; // Exponential backoff
        console.log(`[GENERATE] [RETRY] Attesa ${waitTime}ms prima del prossimo tentativo...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} fallito dopo ${maxRetries} tentativi`);
}

// Crea e pusha repo GitHub con timeout e retry
// Crea progetto su Vercel usando l'API v9 e attende il deployment automatico
async function createVercelDeployment(
  repoName: string,
  repoUrl: string,
  appId: string
): Promise<string> {
  console.log('[GENERATE] [VERCEL] Inizio creazione progetto Vercel...');
  
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!vercelToken) {
    console.warn('[GENERATE] [VERCEL] ⚠️  VERCEL_TOKEN non configurato. Saltando deployment automatico.');
    throw new Error('VERCEL_TOKEN non configurato');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[GENERATE] [VERCEL] ⚠️  Credenziali Supabase non configurate per le env vars.');
  }

  // Estrai owner e repo da repoUrl (es: https://github.com/gpotenza80/erp-app-xxx)
  const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!repoMatch) {
    throw new Error(`Impossibile estrarre owner/repo da URL: ${repoUrl}`);
  }
  const [, owner, repo] = repoMatch;

  console.log('[GENERATE] [VERCEL] Owner:', owner, 'Repo:', repo);

  // Timeout di 5 minuti per il deployment
  const vercelTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout: creazione deployment Vercel superata 5 minuti'));
    }, 300000); // 5 minuti
  });

  return Promise.race([
    (async () => {
      // STEP 1: Crea il progetto usando API v9
      console.log('[GENERATE] [VERCEL] [STEP 1] Creazione progetto...');
      
      let projectId: string | null = null;
      let lastError: Error | null = null;

      // Retry logic per la creazione del progetto
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[GENERATE] [VERCEL] [RETRY] Tentativo ${attempt}/3: creazione progetto...`);
          
          // Prepara il body della richiesta per creare il progetto
          const projectBody: any = {
            name: repoName,
            framework: 'nextjs',
            gitRepository: {
              type: 'github',
              repo: `${owner}/${repo}`,
            },
          };

          // Aggiungi env vars se disponibili
          if (supabaseUrl && supabaseAnonKey) {
            projectBody.environmentVariables = [
              {
                key: 'NEXT_PUBLIC_SUPABASE_URL',
                value: supabaseUrl,
                type: 'plain',
                target: ['production', 'preview', 'development'],
              },
              {
                key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                value: supabaseAnonKey,
                type: 'plain',
                target: ['production', 'preview', 'development'],
              },
            ];
            console.log('[GENERATE] [VERCEL] Env vars formattate:', projectBody.environmentVariables.length, 'variables');
          }

          const response = await fetch('https://api.vercel.com/v9/projects', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(projectBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GENERATE] [VERCEL] Errore HTTP ${response.status}:`, errorText);
            throw new Error(`Vercel API error: ${response.status} - ${errorText}`);
          }

          const projectData = await response.json();
          projectId = projectData.id;
          console.log('[GENERATE] [VERCEL] ✅ Progetto creato:', projectId);
          console.log('[GENERATE] [VERCEL] Project name:', projectData.name);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[GENERATE] [VERCEL] [RETRY] Tentativo ${attempt}/3 fallito:`, lastError.message);
          
          if (attempt < 3) {
            const waitTime = attempt * 2000; // Backoff esponenziale: 2s, 4s
            console.log(`[GENERATE] [VERCEL] Attendo ${waitTime}ms prima di riprovare...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!projectId) {
        throw lastError || new Error('Impossibile creare progetto Vercel dopo 3 tentativi');
      }

      // STEP 2: Ottieni repoId da GitHub
      console.log('[GENERATE] [VERCEL] [STEP 2] Ottenimento repoId da GitHub...');
      const octokit = getGitHubClient();
      let repoId: number | null = null;
      
      try {
        const repoData = await octokit.rest.repos.get({
          owner: owner,
          repo: repo,
        });
        repoId = repoData.data.id;
        console.log('[GENERATE] [VERCEL] Repo ID ottenuto:', repoId);
      } catch (error) {
        console.warn('[GENERATE] [VERCEL] ⚠️  Impossibile ottenere repoId da GitHub:', error);
        throw new Error('Impossibile ottenere repoId da GitHub per triggerare deployment');
      }

      // STEP 3: Triggera manualmente un deployment
      console.log('[GENERATE] [VERCEL] [STEP 3] Trigger deployment manuale...');
      
      let deploymentId: string | null = null;
      lastError = null;

      // Retry logic per il trigger del deployment
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[GENERATE] [VERCEL] [RETRY] Tentativo ${attempt}/3: trigger deployment...`);
          
          const deploymentBody = {
            name: repoName,
            project: projectId,
            target: 'production',
            gitSource: {
              type: 'github',
              repoId: repoId,
              ref: 'main',
            },
          };

          const deploymentResponse = await fetch('https://api.vercel.com/v13/deployments', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(deploymentBody),
          });

          if (!deploymentResponse.ok) {
            const errorText = await deploymentResponse.text();
            console.error(`[GENERATE] [VERCEL] Errore HTTP ${deploymentResponse.status}:`, errorText);
            throw new Error(`Vercel API error: ${deploymentResponse.status} - ${errorText}`);
          }

          const deploymentData = await deploymentResponse.json();
          deploymentId = deploymentData.id;
          console.log('[GENERATE] [VERCEL] Deployment triggerato:', deploymentId);
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[GENERATE] [VERCEL] [RETRY] Tentativo ${attempt}/3 fallito:`, lastError.message);
          
          if (attempt < 3) {
            const waitTime = attempt * 2000; // Backoff esponenziale: 2s, 4s
            console.log(`[GENERATE] [VERCEL] Attendo ${waitTime}ms prima di riprovare...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!deploymentId) {
        throw lastError || new Error('Impossibile triggerare deployment Vercel dopo 3 tentativi');
      }

      // STEP 4: Polling dello stato del deployment specifico
      console.log('[GENERATE] [VERCEL] [STEP 4] Polling stato deployment...');
      
      let deploymentUrl: string | null = null;
      const maxPollingAttempts = 30; // 30 tentativi * 10 secondi = 5 minuti max
      const pollingInterval = 10000; // 10 secondi

      for (let pollingAttempt = 1; pollingAttempt <= maxPollingAttempts; pollingAttempt++) {
        try {
          console.log(`[GENERATE] [VERCEL] [POLLING] Tentativo ${pollingAttempt}/${maxPollingAttempts}: verifica stato deployment ${deploymentId}...`);
          
          // Query GET /v13/deployments/{deploymentId}
          const deploymentStatusResponse = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
            headers: {
              'Authorization': `Bearer ${vercelToken}`,
            },
          });

          if (!deploymentStatusResponse.ok) {
            console.warn(`[GENERATE] [VERCEL] Errore HTTP ${deploymentStatusResponse.status} durante polling`);
            // Continua il polling
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
            continue;
          }

          const deploymentStatus = await deploymentStatusResponse.json();
          const readyState = deploymentStatus.readyState;
          
          console.log(`[GENERATE] [VERCEL] Deployment state: ${readyState || 'UNKNOWN'}`);

          if (readyState === 'READY') {
            // Usa sempre l'URL del progetto (pubblico) invece dell'URL del deployment (può essere privato)
            // L'URL del progetto è sempre: https://{projectName}.vercel.app
            deploymentUrl = `https://${repoName}.vercel.app`;
            
            console.log('[GENERATE] [VERCEL] ✅ Deployment READY!');
            console.log('[GENERATE] [VERCEL] Deployment ID:', deploymentId);
            console.log('[GENERATE] [VERCEL] Project URL:', deploymentUrl);
            break;
          }

          if (readyState === 'ERROR') {
            console.error('[GENERATE] [VERCEL] ❌ Deployment fallito!');
            throw new Error('Deployment fallito su Vercel');
          }

          // Attendi prima del prossimo polling
          if (pollingAttempt < maxPollingAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          }
        } catch (error) {
          console.error(`[GENERATE] [VERCEL] Errore durante polling (tentativo ${pollingAttempt}):`, error);
          // Continua il polling se non è un errore fatale
          if (pollingAttempt < maxPollingAttempts) {
            await new Promise(resolve => setTimeout(resolve, pollingInterval));
          }
        }
      }

      if (!deploymentUrl) {
        // Fallback: usa il nome del progetto
        deploymentUrl = `https://${repoName}.vercel.app`;
        console.warn('[GENERATE] [VERCEL] ⚠️  Deployment URL non ottenuto dal polling, usando URL generico:', deploymentUrl);
      }

      return deploymentUrl;
    })(),
    vercelTimeout,
  ]);
}

async function createAndPushGitHubRepo(
  appId: string,
  files: Record<string, string>,
  prompt: string
): Promise<{ repoUrl: string; deployUrl: string }> {
  console.log('[GENERATE] [GITHUB] Inizio creazione repo GitHub...');
  
  const octokit = getGitHubClient();
  const repoName = `erp-app-${appId.substring(0, 8)}`;
  
  // Timeout di 2 minuti per l'intera operazione GitHub
  const githubTimeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Timeout: operazione GitHub superata 2 minuti'));
    }, 120000);
  });

  return Promise.race([
    (async () => {
      // Ottieni username GitHub
      const username = await withRetry(
        async () => {
          const { data: userData } = await octokit.users.getAuthenticated();
          return userData.login;
        },
        3,
        1000,
        'getGitHubUsername'
      );
      console.log('[GENERATE] [GITHUB] Username:', username);

      // Crea repository
      let repo;
      try {
        repo = await withRetry(
          async () => {
            const createRepoResponse = await octokit.repos.createForAuthenticatedUser({
              name: repoName,
              private: true,
              auto_init: true,
              description: `ERP app generata: ${prompt.substring(0, 100) || 'Generated app'}`,
            });
            return createRepoResponse.data;
          },
          3,
          2000,
          'createRepository'
        );
        console.log('[GENERATE] [GITHUB] Repository creata:', repo.html_url);
      } catch (error: any) {
        if (error.status === 422 && (error.message?.includes('already exists') || error.message?.includes('name already exists'))) {
          console.log('[GENERATE] [GITHUB] Repository già esistente, recupero...');
          repo = await withRetry(
            async () => {
              const { data: existingRepo } = await octokit.repos.get({
                owner: username,
                repo: repoName,
              });
              return existingRepo;
            },
            3,
            1000,
            'getExistingRepository'
          );
          console.log('[GENERATE] [GITHUB] Repository esistente recuperata:', repo.html_url);
        } else {
          throw error;
        }
      }

      // Prepara file
      const baseFiles = getBaseFiles();
      const allFiles = { ...baseFiles, ...files };
      console.log('[GENERATE] [GITHUB] File totali da pushare:', Object.keys(allFiles).length);

      // Ottieni SHA branch
      const branchSha = await withRetry(
        async () => {
          try {
            const { data: refData } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: 'heads/main',
            });
            return refData.object.sha;
          } catch (error: any) {
            const { data: refData } = await octokit.git.getRef({
              owner: repo.owner.login,
              repo: repo.name,
              ref: 'heads/master',
            });
            return refData.object.sha;
          }
        },
        3,
        1000,
        'getBranchSha'
      );
      console.log('[GENERATE] [GITHUB] Branch SHA:', branchSha);

      // Ottieni tree commit
      const baseTreeSha = await withRetry(
        async () => {
          const { data: commitData } = await octokit.git.getCommit({
            owner: repo.owner.login,
            repo: repo.name,
            commit_sha: branchSha,
          });
          return commitData.tree.sha;
        },
        3,
        1000,
        'getBaseTreeSha'
      );
      console.log('[GENERATE] [GITHUB] Base tree SHA:', baseTreeSha);

      // Crea blobs
      const blobShas: Record<string, string> = {};
      for (const [path, content] of Object.entries(allFiles)) {
        const blobSha = await withRetry(
          async () => {
            const { data: blobData } = await octokit.git.createBlob({
              owner: repo.owner.login,
              repo: repo.name,
              content: Buffer.from(content).toString('base64'),
              encoding: 'base64',
            });
            return blobData.sha;
          },
          2,
          500,
          `createBlob-${path}`
        );
        blobShas[path] = blobSha;
      }
      console.log('[GENERATE] [GITHUB] Blobs creati:', Object.keys(blobShas).length);

      // Crea tree
      const treeSha = await withRetry(
        async () => {
          const { data: treeData } = await octokit.git.createTree({
            owner: repo.owner.login,
            repo: repo.name,
            base_tree: baseTreeSha,
            tree: Object.entries(allFiles).map(([path, _]) => ({
              path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: blobShas[path],
            })),
          });
          return treeData.sha;
        },
        3,
        1000,
        'createTree'
      );
      console.log('[GENERATE] [GITHUB] Tree creato:', treeSha);

      // Crea commit
      const commitSha = await withRetry(
        async () => {
          const { data: commitResponse } = await octokit.git.createCommit({
            owner: repo.owner.login,
            repo: repo.name,
            message: 'Initial commit: Generated ERP app',
            tree: treeSha,
            parents: [branchSha],
          });
          return commitResponse.sha;
        },
        3,
        1000,
        'createCommit'
      );
      console.log('[GENERATE] [GITHUB] Commit creato:', commitSha);

      // Aggiorna reference
      const branchName = repo.default_branch || 'main';
      await withRetry(
        async () => {
          await octokit.git.updateRef({
            owner: repo.owner.login,
            repo: repo.name,
            ref: `heads/${branchName}`,
            sha: commitSha,
          });
        },
        3,
        1000,
        'updateRef'
      );
      console.log('[GENERATE] [GITHUB] Reference aggiornata');

      const repoUrl = repo.html_url;
      // Vercel genera automaticamente l'URL basandosi sul nome del repo
      // Il deployment potrebbe richiedere alcuni minuti per essere disponibile
      const deployUrl = `https://${repoName}.vercel.app`;

      return { repoUrl, deployUrl };
    })(),
    githubTimeout,
  ]);
}

export async function POST(request: NextRequest) {
  try {
    console.log('[GENERATE] Inizio richiesta generazione');
    
    // Verifica API key Anthropic
    console.log('[GENERATE] Verifica API key Anthropic...');
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      console.error('[GENERATE] ANTHROPIC_API_KEY non configurata');
      return NextResponse.json(
        { success: false, error: 'ANTHROPIC_API_KEY non configurata' },
        { status: 500 }
      );
    }
    console.log('[GENERATE] API key Anthropic verificata');

    // Leggi il body della richiesta
    console.log('[GENERATE] Lettura body richiesta...');
    const body = await request.json();
    const { prompt } = body;
    console.log('[GENERATE] Body letto, prompt length:', prompt?.length || 0);

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      console.error('[GENERATE] Prompt non valido');
      return NextResponse.json(
        { success: false, error: 'Prompt richiesto' },
        { status: 400 }
      );
    }

    // Inizializza Anthropic client
    console.log('[GENERATE] Inizializzazione Anthropic client...');
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });
    console.log('[GENERATE] Anthropic client inizializzato');

    // Costruisci il prompt per Claude
    console.log('[GENERATE] Costruzione prompt per Claude...');
    const claudePrompt = `CRITICAL INSTRUCTIONS - READ CAREFULLY:

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

Genera un'applicazione Next.js 15 semplice per: ${prompt}

Crea SOLO questi 2 file:
- app/page.tsx (pagina principale con lista semplice)
- components/Form.tsx (form base per creazione/modifica)

Usa Tailwind per UI, tutto in italiano.
Restituisci SOLO codice, separato da === FILENAME: path/file.tsx ===`;
    console.log('[GENERATE] Prompt costruito, length:', claudePrompt.length);

    // Chiama Claude API con timeout di 2 minuti
    console.log('[GENERATE] Chiamata a Claude API (timeout 2 minuti)...');
    const startTime = Date.now();
    
    // Crea una promise per il timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Timeout: la generazione ha superato i 2 minuti'));
      }, 120000); // 2 minuti
    });

    // Chiamata a Claude con race contro timeout
    const message = await Promise.race([
      anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: claudePrompt,
          },
        ],
      }),
      timeoutPromise,
    ]);
    
    const elapsedTime = Date.now() - startTime;
    console.log('[GENERATE] Risposta Claude ricevuta in', elapsedTime, 'ms');

    // Estrai il contenuto della risposta
    console.log('[GENERATE] Estrazione contenuto risposta...');
    const responseText = message.content
      .map((block) => {
        if (block.type === 'text') {
          return block.text;
        }
        return '';
      })
      .join('\n');
    console.log('[GENERATE] Contenuto estratto, length:', responseText.length);

    // Parsea i file dalla risposta
    console.log('[GENERATE] Parsing file dalla risposta...');
    const claudeFiles = parseClaudeResponse(responseText);
    console.log('[GENERATE] File parsati da Claude:', Object.keys(claudeFiles).length, 'file:', Object.keys(claudeFiles));

    if (Object.keys(claudeFiles).length === 0) {
      console.error('[GENERATE] Nessun file trovato nella risposta');
      return NextResponse.json(
        { success: false, error: 'Nessun file trovato nella risposta di Claude', rawResponse: responseText.substring(0, 500) },
        { status: 500 }
      );
    }

    // VALIDAZIONE E AUTO-FIX: Valida e fixa il codice PRIMA di salvare
    console.log('[GENERATE] Inizio validazione e auto-fix del codice...');
    const validationStartTime = Date.now();
    const validated = await validateAndFixCode(claudeFiles, prompt, anthropic, 1, validationStartTime);
    
    if (!validated.success) {
      if (validated.useFallback) {
        console.warn('[GENERATE] ⚠️  Validazione fallita. Usando SAFE_TEMPLATE fallback.');
        if (validated.errors && validated.errors.length > 0) {
          console.warn('[GENERATE] Errori finali:', validated.errors.map(e => `${e.file}: ${e.message}`).join('; '));
        }
      } else {
        console.warn('[GENERATE] ⚠️  Validazione fallita ma senza fallback.');
      }
    } else {
      console.log('[GENERATE] ✅ Codice validato con successo!');
    }
    
    // Usa i file validati (o fallback)
    const validatedFiles = validated.files;
    console.log('[GENERATE] File validati/finali:', Object.keys(validatedFiles).length);

    // Aggiungi file base necessari per Next.js
    console.log('[GENERATE] Aggiunta file base standard...');
    const baseFiles = getBaseFiles();
    // Combina file base + file generati (i file generati hanno priorità se ci sono conflitti)
    const files = { ...baseFiles, ...validatedFiles };
    console.log('[GENERATE] File totali (base + generati):', Object.keys(files).length);

    // Inizializza Supabase
    console.log('[GENERATE] Inizializzazione Supabase client...');
    const supabase = getSupabaseClient();
    console.log('[GENERATE] Supabase client inizializzato');

    // Assicurati che la tabella esista (in produzione, usa migration)
    console.log('[GENERATE] Verifica/creazione tabella...');
    try {
      await ensureTableExists(supabase);
      console.log('[GENERATE] Tabella verificata/creata');
    } catch (error) {
      // Ignora errori se la tabella esiste già o se RPC non è disponibile
      console.warn('[GENERATE] Impossibile verificare/creare tabella:', error);
    }

    // Genera UUID per l'app
    console.log('[GENERATE] Generazione UUID...');
    const appId = randomUUID();
    console.log('[GENERATE] UUID generato:', appId);

    // Salva in Supabase
    console.log('[GENERATE] Salvataggio in Supabase...');
    const { data, error: supabaseError } = await supabase
      .from('generated_apps')
      .insert({
        id: appId,
        prompt: prompt,
        files: files,
      })
      .select()
      .single();

    if (supabaseError) {
      console.error('[GENERATE] Errore Supabase:', supabaseError);
      // Se la tabella non esiste, prova a crearla manualmente
      if (supabaseError.code === '42P01') {
        return NextResponse.json(
          { success: false, error: 'Tabella generated_apps non esiste. Crea la tabella manualmente in Supabase.' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Errore database: ${supabaseError.message}` },
        { status: 500 }
      );
    }
    console.log('[GENERATE] Dati salvati in Supabase con successo');

    // Crea repo GitHub e pusha file
    let repoUrl: string | undefined;
    let deployUrl: string | undefined;
    
    try {
      console.log('[GENERATE] Creazione repo GitHub...');
      const githubResult = await createAndPushGitHubRepo(appId, files, prompt);
      repoUrl = githubResult.repoUrl;
      const repoName = `erp-app-${appId.substring(0, 8)}`;
      console.log('[GENERATE] Repo GitHub creato:', repoUrl);
      
      // Crea deployment su Vercel usando l'API
      try {
        console.log('[GENERATE] Creazione deployment Vercel...');
        const vercelDeployUrl = await createVercelDeployment(repoName, repoUrl, appId);
        deployUrl = vercelDeployUrl;
        console.log('[GENERATE] ✅ Deployment Vercel creato:', deployUrl);
      } catch (vercelError) {
        console.error('[GENERATE] ⚠️  Errore durante creazione deployment Vercel:', vercelError);
        // Fallback al deployUrl generico se Vercel API fallisce
        deployUrl = githubResult.deployUrl;
        console.log('[GENERATE] ⚠️  Usando deployUrl generico come fallback:', deployUrl);
        // Non blocchiamo il flusso se Vercel fallisce
      }
      
      // Salva repoUrl e deployUrl nel database se disponibili
      if (repoUrl || deployUrl) {
        console.log('[GENERATE] Salvataggio repoUrl e deployUrl nel database...');
        const updateData: { repoUrl?: string; deployUrl?: string } = {};
        if (repoUrl) updateData.repoUrl = repoUrl;
        if (deployUrl) updateData.deployUrl = deployUrl;
        
        const { error: updateError } = await supabase
          .from('generated_apps')
          .update(updateData)
          .eq('id', appId);
        
        if (updateError) {
          console.warn('[GENERATE] Impossibile salvare repoUrl/deployUrl:', updateError);
          console.warn('[GENERATE] Errore code:', updateError.code, 'message:', updateError.message);
          // Se la colonna non esiste, suggeriamo di aggiungerla manualmente
          if (updateError.code === 'PGRST204' || updateError.message?.includes('column')) {
            console.warn('[GENERATE] ⚠️  Le colonne repoUrl/deployUrl non esistono nella tabella.');
            console.warn('[GENERATE] ⚠️  Esegui questo SQL in Supabase:');
            console.warn('[GENERATE] ⚠️  ALTER TABLE generated_apps ADD COLUMN IF NOT EXISTS "repoUrl" TEXT;');
            console.warn('[GENERATE] ⚠️  ALTER TABLE generated_apps ADD COLUMN IF NOT EXISTS "deployUrl" TEXT;');
          }
          // Non blocchiamo se il deployUrl non può essere salvato (colonna potrebbe non esistere)
        } else {
          console.log('[GENERATE] ✅ repoUrl e deployUrl salvati nel database');
        }
      }
    } catch (error) {
      console.error('[GENERATE] Errore durante creazione repo GitHub:', error);
      // Non blocchiamo la risposta se GitHub fallisce, ma loggiamo l'errore
      // L'app è comunque salvata in DB
    }

    // Restituisci successo
    const totalTime = Date.now() - startTime;
    console.log('[GENERATE] Generazione completata in', totalTime, 'ms');
    return NextResponse.json({
      success: true,
      id: appId,
      message: 'Applicazione generata!',
      filesCount: Object.keys(files).length,
      files: files,
      repoUrl: repoUrl,
      deployUrl: deployUrl,
    });
  } catch (error) {
    console.error('[GENERATE] Errore durante la generazione:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    );
  }
}

