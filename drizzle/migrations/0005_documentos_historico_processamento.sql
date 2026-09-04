ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS estado_processamento text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS dados_extraidos jsonb,
  ADD COLUMN IF NOT EXISTS resumo text,
  ADD COLUMN IF NOT EXISTS erro_processamento text,
  ADD COLUMN IF NOT EXISTS tamanho_bytes bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS processado_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE public.documentos ALTER COLUMN viagem_id DROP NOT NULL;

ALTER TABLE public.documentos
  ADD CONSTRAINT documentos_estado_processamento_check
  CHECK (estado_processamento IN ('pendente','extracao','analise','validacao','concluido','falhou'));

CREATE INDEX IF NOT EXISTS documentos_user_created_idx
  ON public.documentos (user_id, created_at DESC);