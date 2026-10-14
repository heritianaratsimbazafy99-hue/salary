-- HR roles are added in their own migration: a new enum value cannot be used
-- by policies or casts until the transaction that adds it has committed.
-- team_manager: HR decisions for assigned departments/sites, never payslips or private documents.
-- client_viewer: read-only operational view of assigned client sites.
alter type public.app_role add value if not exists 'team_manager';
alter type public.app_role add value if not exists 'client_viewer';
