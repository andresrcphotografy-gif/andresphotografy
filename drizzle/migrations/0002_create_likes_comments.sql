CREATE TABLE public.match_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, client_id)
);
GRANT SELECT, INSERT, DELETE ON public.match_likes TO anon, authenticated;
GRANT ALL ON public.match_likes TO service_role;
ALTER TABLE public.match_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read match_likes" ON public.match_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert match_likes" ON public.match_likes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public delete match_likes" ON public.match_likes FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE public.match_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.match_comments TO anon, authenticated;
GRANT ALL ON public.match_comments TO service_role;
ALTER TABLE public.match_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read match_comments" ON public.match_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert match_comments" ON public.match_comments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public delete match_comments" ON public.match_comments FOR DELETE TO anon, authenticated USING (true);