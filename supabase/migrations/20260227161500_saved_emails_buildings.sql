CREATE TABLE IF NOT EXISTS public.saved_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS public.saved_buildings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Enable RLS
ALTER TABLE public.saved_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_buildings ENABLE ROW LEVEL SECURITY;

-- Policies for saved_emails
CREATE POLICY "Users can view their own saved emails"
    ON public.saved_emails FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved emails"
    ON public.saved_emails FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved emails"
    ON public.saved_emails FOR DELETE
    USING (auth.uid() = user_id);

-- Policies for saved_buildings
CREATE POLICY "Users can view their own saved buildings"
    ON public.saved_buildings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved buildings"
    ON public.saved_buildings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved buildings"
    ON public.saved_buildings FOR DELETE
    USING (auth.uid() = user_id);
