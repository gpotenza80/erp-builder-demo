-- Migration: Modular System
-- Description: Passa da "app singole" a "workspace con moduli collegati e versioni"
-- Date: 2025-01-XX

-- Workspaces (contenitore principale utente)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Modules (ogni modulo es: Ordini, Clienti)
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Ordini", "Clienti"
  slug TEXT NOT NULL, -- "ordini", "clienti"
  type TEXT, -- "orders", "customers", "inventory"
  description TEXT,
  
  -- Puntatori alle versioni attive
  dev_version_id UUID,
  staging_version_id UUID,
  prod_version_id UUID,
  
  -- Collegamenti con altri moduli
  connected_modules JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(workspace_id, slug)
);

-- Module Versions (storico versioni di ogni modulo)
CREATE TABLE IF NOT EXISTS module_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Generazione
  prompt TEXT NOT NULL,
  files JSONB NOT NULL,
  
  -- Schema database
  database_schema JSONB,
  
  -- Deploy info
  github_repo_url TEXT,
  dev_deploy_url TEXT,
  staging_deploy_url TEXT,
  prod_deploy_url TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'deployed_dev', 'deployed_staging', 'deployed_prod'
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT, -- descrizione azione che ha creato
  parent_version_id UUID REFERENCES module_versions(id),
  
  UNIQUE(module_id, version_number)
);

-- Module Connections (relazioni tra moduli)
CREATE TABLE IF NOT EXISTS module_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  from_module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  to_module_id UUID REFERENCES modules(id) ON DELETE CASCADE,
  
  connection_type TEXT, -- 'foreign_key', 'api', 'shared_data'
  
  -- Config connessione
  from_field TEXT,
  to_field TEXT,
  config JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(from_module_id, to_module_id, connection_type)
);

-- Indexes per performance
CREATE INDEX IF NOT EXISTS idx_modules_workspace ON modules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_modules_type ON modules(type);
CREATE INDEX IF NOT EXISTS idx_module_versions_module ON module_versions(module_id);
CREATE INDEX IF NOT EXISTS idx_module_versions_status ON module_versions(status);
CREATE INDEX IF NOT EXISTS idx_module_connections_workspace ON module_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_module_connections_from ON module_connections(from_module_id);
CREATE INDEX IF NOT EXISTS idx_module_connections_to ON module_connections(to_module_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);

-- Foreign key constraints per versioni attive (opzionale, per integrità referenziale)
-- Nota: Questi constraint potrebbero essere aggiunti dopo se necessario
-- ALTER TABLE modules ADD CONSTRAINT fk_dev_version 
--   FOREIGN KEY (dev_version_id) REFERENCES module_versions(id);
-- ALTER TABLE modules ADD CONSTRAINT fk_staging_version 
--   FOREIGN KEY (staging_version_id) REFERENCES module_versions(id);
-- ALTER TABLE modules ADD CONSTRAINT fk_prod_version 
--   FOREIGN KEY (prod_version_id) REFERENCES module_versions(id);

-- Comments per documentazione
COMMENT ON TABLE workspaces IS 'Workspaces: contenitori principali per utenti, ogni workspace può contenere più moduli';
COMMENT ON TABLE modules IS 'Modules: singoli moduli funzionali (es: Ordini, Clienti, Magazzino)';
COMMENT ON TABLE module_versions IS 'Module Versions: storico versioni di ogni modulo con codice generato e deploy info';
COMMENT ON TABLE module_connections IS 'Module Connections: relazioni e connessioni tra moduli diversi';

COMMENT ON COLUMN modules.dev_version_id IS 'Puntatore alla versione attiva in ambiente development';
COMMENT ON COLUMN modules.staging_version_id IS 'Puntatore alla versione attiva in ambiente staging';
COMMENT ON COLUMN modules.prod_version_id IS 'Puntatore alla versione attiva in ambiente production';
COMMENT ON COLUMN modules.connected_modules IS 'Array JSON di ID moduli collegati';
COMMENT ON COLUMN module_versions.parent_version_id IS 'ID della versione da cui è stata generata questa (per tracciare evoluzione)';
COMMENT ON COLUMN module_connections.connection_type IS 'Tipo di connessione: foreign_key, api, shared_data';

