
-- Venue Advance Notes (VANs) — per-venue structured advance data extracted from Advance Master documents
CREATE TABLE public.venue_advance_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id UUID NOT NULL REFERENCES public.tours(id) ON DELETE CASCADE,
  source_doc_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  venue_name TEXT NOT NULL,
  normalized_venue_name TEXT NOT NULL,
  city TEXT,
  event_date DATE,
  van_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_van_tour_venue ON public.venue_advance_notes (tour_id, normalized_venue_name);
CREATE INDEX idx_van_tour_date ON public.venue_advance_notes (tour_id, event_date);

-- Enable RLS
ALTER TABLE public.venue_advance_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies matching existing pattern
CREATE POLICY "Members can view VANs" ON public.venue_advance_notes FOR SELECT USING (is_tour_member(tour_id));
CREATE POLICY "TA/MGMT can insert VANs" ON public.venue_advance_notes FOR INSERT WITH CHECK (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can update VANs" ON public.venue_advance_notes FOR UPDATE USING (is_tour_admin_or_mgmt(tour_id));
CREATE POLICY "TA/MGMT can delete VANs" ON public.venue_advance_notes FOR DELETE USING (is_tour_admin_or_mgmt(tour_id));

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_advance_notes TO authenticated;

-- Timestamp trigger
CREATE TRIGGER update_van_updated_at BEFORE UPDATE ON public.venue_advance_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
