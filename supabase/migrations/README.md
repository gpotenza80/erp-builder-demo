# Supabase Migrations

Questa directory contiene le migration SQL per il database Supabase.

## Struttura

- `002_modular_system.sql` - Sistema modulare con workspaces, modules, versions e connections

## Come Applicare le Migrations

### Opzione 1: Supabase Dashboard (SQL Editor)

1. Vai su [Supabase Dashboard](https://app.supabase.com)
2. Seleziona il tuo progetto
3. Vai su **SQL Editor**
4. Copia e incolla il contenuto del file di migration
5. Esegui la query

### Opzione 2: Supabase CLI

```bash
# Installa Supabase CLI
npm install -g supabase

# Login
supabase login

# Link al progetto
supabase link --project-ref your-project-ref

# Applica migrations
supabase db push
```

### Opzione 3: Script Manuale

Copia il contenuto del file SQL e eseguilo direttamente nel SQL Editor di Supabase.

## Ordine delle Migrations

Le migrations devono essere eseguite in ordine numerico:
1. `001_initial.sql` (se esiste)
2. `002_modular_system.sql`
3. etc.

## Rollback

Per rollback, crea una nuova migration che rimuove le tabelle create:

```sql
DROP TABLE IF EXISTS module_connections;
DROP TABLE IF EXISTS module_versions;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS workspaces;
```

