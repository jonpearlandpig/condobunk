
-- Integration provider enum
CREATE TYPE public.integration_provider AS ENUM ('MASTER_TOUR', 'GENERIC_WEBHOOK', 'CSV_IMPORT');

-- Sync status enum
CREATE TYPE public.sync_status AS ENUM ('IDLE', 'SYNCING', 'SUCCESS', 'FAILED');

-- Tour integrations table
CREATE TABLE public.tour_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  label TEXT, -- user-friendly name like "Our Master Tour Account"
  api_key_encrypted TEXT, -- encrypted MT API key/secret (stored encrypted)
  api_secret_encrypted TEXT,
  webhook_secret TEXT, -- shared secret for validating inbound webhooks
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status sync_status NOT NULL DEFAULT 'IDLE',
  config JSONB DEFAULT '{}'::jsonb, -- provider-specific config (MT tour ID, polling interval, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tour_id, provider)
);

-- Sync logs table
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.tour_integrations(id) ON DELETE CASCADE,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  status sync_status NOT NULL DEFAULT 'SYNCING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  events_upserted INT DEFAULT 0,
  contacts_upserted INT DEFAULT 0,
  finance_upserted INT DEFAULT 0,
  conflicts_created INT DEFAULT 0,
  gaps_created INT DEFAULT 0,
  error_message TEXT,
  raw_payload JSONB -- store the inbound payload for debugging
);

-- Enable RLS
ALTER TABLE public.tour_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only TA/MGMT can manage integrations
CREATE POLICY "TA/MGMT can view integrations"
  ON public.tour_integrations FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can insert integrations"
  ON public.tour_integrations FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update integrations"
  ON public.tour_integrations FOR UPDATE
  USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can delete integrations"
  ON public.tour_integrations FOR DELETE
  USING (is_tour_admin_or_mgmt(tour_id));

-- RLS: Only TA/MGMT can view sync logs
CREATE POLICY "TA/MGMT can view sync logs"
  ON public.sync_logs FOR SELECT
  USING (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can insert sync logs"
  ON public.sync_logs FOR INSERT
  WITH CHECK (is_tour_admin_or_mgmt(tour_id));

CREATE POLICY "TA/MGMT can update sync logs"
  ON public.sync_logs FOR UPDATE
  USING (is_tour_admin_or_mgmt(tour_id));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sync_logs TO authenticated;

-- Service role needs direct access for edge functions
GRANT ALL ON public.tour_integrations TO service_role;
GRANT ALL ON public.sync_logs TO service_role;

-- Updated_at trigger for tour_integrations
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tour_integrations_updated_at
  BEFORE UPDATE ON public.tour_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
