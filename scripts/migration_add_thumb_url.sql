-- Migracja: dodanie kolumn thumb_url i thumb_url_webp do task_photos
ALTER TABLE public.task_photos
ADD COLUMN IF NOT EXISTS thumb_url text,
ADD COLUMN IF NOT EXISTS thumb_url_webp text;
