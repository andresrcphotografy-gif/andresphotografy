ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS dorsals integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS photos_dorsals_idx ON public.photos USING gin (dorsals);
CREATE INDEX IF NOT EXISTS photos_tags_idx ON public.photos USING gin (tags);