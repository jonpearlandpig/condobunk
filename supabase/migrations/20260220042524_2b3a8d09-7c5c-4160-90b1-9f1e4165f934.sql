
-- Add contact_scope enum
CREATE TYPE public.contact_scope AS ENUM ('TOUR', 'VENUE');

-- Add scope and venue columns to contacts
ALTER TABLE public.contacts
  ADD COLUMN scope public.contact_scope NOT NULL DEFAULT 'TOUR',
  ADD COLUMN venue text;
