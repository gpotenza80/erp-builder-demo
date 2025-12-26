-- Migration: Migrate Existing Data from generated_apps
-- Description: Migra i dati esistenti da generated_apps al nuovo sistema modulare
-- Date: 2025-01-XX
-- Prerequisites: 002_modular_system.sql deve essere eseguita prima

-- Step 1: Crea workspace di default se non esiste
INSERT INTO workspaces (id, user_id, name, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'default_user',
  'My Workspace',
  MIN(created_at),
  MAX(updated_at)
FROM generated_apps
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE user_id = 'default_user')
GROUP BY 1
LIMIT 1;

-- Se non ci sono app esistenti, crea comunque un workspace di default
INSERT INTO workspaces (id, user_id, name)
SELECT gen_random_uuid(), 'default_user', 'My Workspace'
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE user_id = 'default_user')
  AND NOT EXISTS (SELECT 1 FROM generated_apps);

-- Step 2: Crea moduli per ogni app esistente in generated_apps
INSERT INTO modules (
  workspace_id,
  name,
  slug,
  type,
  description,
  prod_version_id,
  created_at,
  updated_at
)
SELECT 
  (SELECT id FROM workspaces WHERE user_id = 'default_user' LIMIT 1),
  'Legacy App ' || substring(ga.id::text, 1, 8),
  'legacy-' || substring(ga.id::text, 1, 8),
  'legacy',
  COALESCE(ga.prompt, 'Migrated from legacy system'),
  NULL, -- prod_version_id sarà impostato dopo aver creato le versioni
  ga.created_at,
  COALESCE(ga.updated_at, ga.created_at)
FROM generated_apps ga
WHERE NOT EXISTS (
  SELECT 1 FROM modules m 
  WHERE m.slug = 'legacy-' || substring(ga.id::text, 1, 8)
);

-- Step 3: Crea versioni per ogni app esistente
INSERT INTO module_versions (
  module_id,
  version_number,
  prompt,
  files,
  github_repo_url,
  dev_deploy_url,
  staging_deploy_url,
  prod_deploy_url,
  status,
  created_at,
  created_by
)
SELECT 
  m.id,
  1, -- Prima versione
  COALESCE(ga.prompt, 'Migrated from legacy system'),
  COALESCE(ga.files, '{}'::jsonb),
  ga.repoUrl,
  NULL, -- dev_deploy_url
  NULL, -- staging_deploy_url
  ga.deployUrl, -- prod_deploy_url (se esiste)
  CASE 
    WHEN ga.deployUrl IS NOT NULL THEN 'deployed_prod'
    ELSE 'draft'
  END,
  ga.created_at,
  'Migration from generated_apps'
FROM generated_apps ga
INNER JOIN modules m ON m.slug = 'legacy-' || substring(ga.id::text, 1, 8)
WHERE NOT EXISTS (
  SELECT 1 FROM module_versions mv 
  WHERE mv.module_id = m.id AND mv.version_number = 1
);

-- Step 4: Aggiorna moduli con prod_version_id
UPDATE modules m
SET prod_version_id = mv.id
FROM module_versions mv
WHERE mv.module_id = m.id
  AND mv.version_number = 1
  AND mv.status = 'deployed_prod'
  AND m.prod_version_id IS NULL;

-- Step 5: Se non ci sono versioni deployate, imposta la prima versione come draft
UPDATE modules m
SET dev_version_id = mv.id
FROM module_versions mv
WHERE mv.module_id = m.id
  AND mv.version_number = 1
  AND m.dev_version_id IS NULL
  AND m.prod_version_id IS NULL;

-- Verifica risultati (commentato, da eseguire manualmente per debug)
-- SELECT 
--   (SELECT COUNT(*) FROM workspaces) as workspaces_count,
--   (SELECT COUNT(*) FROM modules) as modules_count,
--   (SELECT COUNT(*) FROM module_versions) as versions_count,
--   (SELECT COUNT(*) FROM generated_apps) as legacy_apps_count;

-- Note: La tabella generated_apps viene mantenuta per compatibilità backward
-- Può essere rimossa in futuro dopo aver verificato che tutti i dati sono stati migrati

