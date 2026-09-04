CREATE TABLE public.avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'outro',
  titulo text NOT NULL,
  local text,
  quando timestamptz NOT NULL,
  antecipacao_min integer NOT NULL DEFAULT 60,
  ativo boolean NOT NULL DEFAULT true,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos TO authenticated;
GRANT ALL ON public.avisos TO service_role;

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avisos proprios" ON public.avisos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX avisos_user_quando_idx ON public.avisos (user_id, quando);

CREATE TABLE public.preferencias_avisos (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  avisos_ativos boolean NOT NULL DEFAULT true,
  antecipacao_padrao_min integer NOT NULL DEFAULT 60,
  push_ativado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preferencias_avisos TO authenticated;
GRANT ALL ON public.preferencias_avisos TO service_role;

ALTER TABLE public.preferencias_avisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preferencias proprias" ON public.preferencias_avisos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);