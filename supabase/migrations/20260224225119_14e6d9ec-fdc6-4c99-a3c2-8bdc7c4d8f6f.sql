
-- Create site_inquiries table for contact form submissions
CREATE TABLE public.site_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public contact form, no auth required)
CREATE POLICY "Anyone can submit inquiry"
  ON public.site_inquiries
  FOR INSERT
  WITH CHECK (true);

-- Only the demo owner (admin) can view inquiries
CREATE POLICY "Admin can view inquiries"
  ON public.site_inquiries
  FOR SELECT
  USING (auth.uid() = '1385f11a-1337-4ef7-83ac-1bbd62af4781'::uuid);
