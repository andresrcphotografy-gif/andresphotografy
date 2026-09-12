CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team text NOT NULL,
  away_team text NOT NULL,
  match_date date,
  venue text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read matches" ON public.matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert matches" ON public.matches FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update matches" ON public.matches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public delete matches" ON public.matches FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO anon, authenticated;
GRANT ALL ON public.photos TO service_role;

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read photos" ON public.photos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert photos" ON public.photos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public delete photos" ON public.photos FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX idx_photos_match_id ON public.photos(match_id);

CREATE POLICY "Public read photo files" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'photos');
CREATE POLICY "Public upload photo files" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'photos');
CREATE POLICY "Public delete photo files" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'photos');