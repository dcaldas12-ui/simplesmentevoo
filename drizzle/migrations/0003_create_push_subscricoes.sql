CREATE TABLE public.push_subscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscricoes TO authenticated;
GRANT ALL ON public.push_subscricoes TO service_role;

ALTER TABLE public.push_subscricoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscricoes_select_own" ON public.push_subscricoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "push_subscricoes_insert_own" ON public.push_subscricoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscricoes_update_own" ON public.push_subscricoes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "push_subscricoes_delete_own" ON public.push_subscricoes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_push_subscricoes_user ON public.push_subscricoes (user_id, ativo);