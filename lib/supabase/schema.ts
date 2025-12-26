/**
 * TypeScript types per le tabelle del sistema modulare
 * Generati per corrispondere allo schema Supabase
 */

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  type?: string;
  description?: string;
  icon?: string;
  dev_version_id?: string;
  staging_version_id?: string;
  prod_version_id?: string;
  connected_modules?: string[];
  created_at: string;
  updated_at: string;
}

export interface ModuleVersion {
  id: string;
  module_id: string;
  version_number: number;
  prompt: string;
  files: Record<string, string>;
  database_schema?: any;
  github_repo_url?: string;
  github_branch?: string;
  dev_deploy_url?: string;
  staging_deploy_url?: string;
  prod_deploy_url?: string;
  status: 'draft' | 'deploying' | 'deployed_dev' | 'deployed_staging' | 'deployed_prod' | 'failed';
  build_log?: string;
  parent_version_id?: string;
  created_at: string;
  created_by?: string;
}

export interface ModuleConnection {
  id: string;
  workspace_id: string;
  from_module_id: string;
  to_module_id: string;
  connection_type: 'foreign_key' | 'api_call' | 'shared_data';
  from_field?: string;
  to_field?: string;
  config?: Record<string, any>;
  created_at: string;
}

