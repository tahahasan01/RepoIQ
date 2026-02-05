# Database Migration Instructions

## Running the Organizations and Teams Migration

The migration file `002_organizations_and_teams.sql` creates the necessary tables for organizations, teams, developer tracking, and related features.

### Option 1: Using Supabase SQL Editor (Recommended)

1. Log in to your Supabase dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `Backend/database/migrations/002_organizations_and_teams.sql`
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
7. Verify the tables were created by checking the **Table Editor** section

### Option 2: Using Alembic (If configured)

If you have Alembic configured for migrations:

```bash
cd Backend
alembic upgrade head
```

### Option 3: Using psql Command Line

```bash
psql -h your-supabase-host -U postgres -d postgres -f Backend/database/migrations/002_organizations_and_teams.sql
```

### Verification

After running the migration, verify the following tables exist:

- `public.organizations`
- `public.teams`
- `public.team_members`
- `public.repository_assignments`
- `public.developer_contributions`
- `public.developer_metrics`
- `public.code_ownership`
- `public.issue_blame`
- `public.audit_logs`

You can verify in Supabase by:
1. Going to **Table Editor**
2. Checking that all the above tables are listed

### Troubleshooting

**Error: "Could not find the table 'public.organizations'"**

This means the migration hasn't been run yet. Follow the steps above to run the migration.

**Error: "relation already exists"**

This means the tables already exist. You can either:
- Skip the migration (if tables are already set up correctly)
- Drop and recreate (be careful - this will delete data):
  ```sql
  DROP TABLE IF EXISTS public.audit_logs CASCADE;
  DROP TABLE IF EXISTS public.issue_blame CASCADE;
  DROP TABLE IF EXISTS public.code_ownership CASCADE;
  DROP TABLE IF EXISTS public.developer_metrics CASCADE;
  DROP TABLE IF EXISTS public.developer_contributions CASCADE;
  DROP TABLE IF EXISTS public.repository_assignments CASCADE;
  DROP TABLE IF EXISTS public.team_members CASCADE;
  DROP TABLE IF EXISTS public.teams CASCADE;
  DROP TABLE IF EXISTS public.organizations CASCADE;
  ```
  Then run the migration again.

### Important Notes

- The migration includes Row Level Security (RLS) policies for data access control
- All tables are created in the `public` schema
- Foreign key constraints ensure data integrity
- Indexes are created for performance optimization
