-- RLS policies for building-task-manager
-- Run these in Supabase SQL editor for your project (adjust schema/names if needed)

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

-- profiles: user can see their profile; company members can select; users can update own profile
CREATE POLICY profiles_select_self_or_company
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      id = auth.uid()
      OR (
        company_id IS NOT NULL
        AND company_id = (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  USING ( id = auth.uid() )
  WITH CHECK ( id = auth.uid() );

-- tasks: creator, assignee, or same company can read; create allowed if created_by = auth.uid(); update allowed only by allowed actors
CREATE POLICY tasks_select_allowed
  ON public.tasks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      created_by = auth.uid()
      OR assigned_user_id = auth.uid()
      OR assigned_company_id = (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY tasks_insert_owner
  ON public.tasks FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

CREATE POLICY tasks_update_allowed
  ON public.tasks FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      created_by = auth.uid()
      OR assigned_user_id = auth.uid()
      OR assigned_company_id = (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- task_photos: only users allowed to see the parent task can SELECT/INSERT
CREATE POLICY task_photos_select_allowed
  ON public.task_photos FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_photos.task_id
        AND (
          t.created_by = auth.uid()
          OR t.assigned_user_id = auth.uid()
          OR t.assigned_company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        )
    )
  );

CREATE POLICY task_photos_insert_allowed
  ON public.task_photos FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (uploaded_by = auth.uid())
  );

-- Storage objects policy for bucket "task-photos"
-- Note: storage.objects is in schema 'storage'
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY storage_objects_select_task_photos
  ON storage.objects FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.task_photos tp
      WHERE tp.storage_bucket = storage.objects.bucket_id
        AND tp.storage_path = storage.objects.name
        AND EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.id = tp.task_id
            AND (
              t.created_by = auth.uid()
              OR t.assigned_user_id = auth.uid()
              OR t.assigned_company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
            )
        )
    )
  );

-- End of RLS policies
