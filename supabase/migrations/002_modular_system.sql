-- ========================================
-- Migration: Modular System
-- Description: Passa da "app singole" a "workspace con moduli collegati e versioni"
-- Date: 2025-01-XX
-- ========================================

-- ========================================
-- WORKSPACES: Contenitore principale utente
-- ========================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Workspace',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);

-- ========================================
-- MODULES: Ogni modulo ERP (Ordini, Clienti, ecc)
-- ========================================
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Identificazione
  name TEXT NOT NULL, -- "Gestione Ordini"
  slug TEXT NOT NULL, -- "ordini"
  type TEXT, -- "orders", "customers", "inventory", "custom"
  description TEXT,
  icon TEXT, -- emoji o nome icona
  
  -- Puntatori alle versioni attive per ambiente
  dev_version_id UUID,
  staging_version_id UUID,
  prod_version_id UUID,
  
  -- Collegamenti con altri moduli
  connected_modules JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(workspace_id, slug)
);

-- ========================================
-- MODULE VERSIONS: Storico versioni di ogni modulo
-- ========================================
CREATE TABLE IF NOT EXISTS module_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Generazione
  prompt TEXT NOT NULL, -- Prompt che ha creato questa versione
  files JSONB NOT NULL, -- Codice generato
  
  -- Schema database del modulo
  database_schema JSONB,
  
  -- Deploy info
  github_repo_url TEXT,
  github_branch TEXT DEFAULT 'main',
  
  dev_deploy_url TEXT,
  staging_deploy_url TEXT,
  prod_deploy_url TEXT,
  
  -- Status tracking
  status TEXT DEFAULT 'draft', -- 'draft', 'deploying', 'deployed_dev', 'deployed_staging', 'deployed_prod', 'failed'
  build_log TEXT, -- Log del build (per debug)
  
  -- Relazioni versioni
  parent_version_id UUID REFERENCES module_versions(id),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT, -- Descrizione azione/utente
  
  UNIQUE(module_id, version_number)
);

-- ========================================
-- MODULE CONNECTIONS: Relazioni tra moduli
-- ========================================
CREATE TABLE IF NOT EXISTS module_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  from_module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  to_module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  
  -- Tipo di connessione
  connection_type TEXT NOT NULL, -- 'foreign_key', 'api_call', 'shared_data'
  
  -- Configurazione connessione
  from_field TEXT, -- Campo nel modulo sorgente
  to_field TEXT, -- Campo nel modulo destinazione
  config JSONB DEFAULT '{}'::jsonb, -- Config aggiuntiva
  
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

-- ========================================
-- ROW LEVEL SECURITY (opzionale per multi-tenant futuro)
-- ========================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_connections ENABLE ROW LEVEL SECURITY;

-- Policy permissiva per ora (tutti possono tutto)
-- In futuro: filtrare per user_id
CREATE POLICY "Enable all for workspaces" ON workspaces FOR ALL USING (true);
CREATE POLICY "Enable all for modules" ON modules FOR ALL USING (true);
CREATE POLICY "Enable all for module_versions" ON module_versions FOR ALL USING (true);
CREATE POLICY "Enable all for module_connections" ON module_connections FOR ALL USING (true);

-- ========================================
-- FUNZIONI UTILITY
-- ========================================

-- Funzione per auto-increment version_number
CREATE OR REPLACE FUNCTION get_next_version_number(p_module_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_version
  FROM module_versions
  WHERE module_id = p_module_id;
  
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- Trigger per aggiornare updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
COMMENT ON COLUMN module_connections.connection_type IS 'Tipo di connessione: foreign_key, api_call, shared_data';

