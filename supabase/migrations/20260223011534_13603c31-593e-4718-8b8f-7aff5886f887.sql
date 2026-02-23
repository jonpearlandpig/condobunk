-- Revoke SELECT on sensitive credential columns from authenticated role
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses this restriction
REVOKE SELECT (api_key_encrypted, api_secret_encrypted) ON public.tour_integrations FROM authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';