CREATE TABLE public.admin_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  walkthrough_id uuid NOT NULL REFERENCES public.walkthroughs(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX idx_admin_edits_walkthrough ON public.admin_edits(walkthrough_id);
CREATE INDEX idx_admin_edits_edited_at ON public.admin_edits(edited_at DESC);

ALTER TABLE public.admin_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all admin_edits"
  ON public.admin_edits FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Owners can read admin_edits on their walkthroughs"
  ON public.admin_edits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.walkthroughs w
    WHERE w.id = admin_edits.walkthrough_id AND w.user_id = auth.uid()
  ));

CREATE POLICY "Admins can insert admin_edits"
  ON public.admin_edits FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND edited_by = auth.uid());

CREATE POLICY "Admins can update all walkthroughs"
  ON public.walkthroughs FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));