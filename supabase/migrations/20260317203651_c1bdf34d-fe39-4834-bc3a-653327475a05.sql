
-- Fix security definer view warning
DROP VIEW IF EXISTS public.v_show_advance_readiness;

CREATE VIEW public.v_show_advance_readiness WITH (security_invoker = true) AS
SELECT
  sa.id AS show_advance_id,
  sa.tour_id,
  sa.status,
  (SELECT count(*) FROM public.advance_fields af
   WHERE af.show_advance_id = sa.id
     AND af.field_criticality = 'critical'
     AND NOT (af.status = 'confirmed' AND af.locked_boolean = true)
  ) AS critical_unresolved_count,
  (SELECT count(*) FROM public.advance_flags fl
   WHERE fl.show_advance_id = sa.id AND fl.severity = 'red' AND fl.status = 'open'
  ) AS red_flag_open_count,
  CASE
    WHEN (SELECT count(*) FROM public.advance_fields af
          WHERE af.show_advance_id = sa.id AND af.field_criticality = 'critical'
            AND NOT (af.status = 'confirmed' AND af.locked_boolean = true)) > 0
      THEN 'not_ready'
    WHEN (SELECT count(*) FROM public.advance_flags fl
          WHERE fl.show_advance_id = sa.id AND fl.severity = 'red' AND fl.status = 'open') > 0
      THEN 'not_ready'
    WHEN (SELECT count(*) FROM public.advance_flags fl
          WHERE fl.show_advance_id = sa.id AND fl.severity = 'yellow' AND fl.status = 'open') > 0
      THEN 'needs_review'
    ELSE 'ready'
  END AS readiness_status
FROM public.show_advances sa;

GRANT SELECT ON public.v_show_advance_readiness TO authenticated;
NOTIFY pgrst, 'reload schema';
