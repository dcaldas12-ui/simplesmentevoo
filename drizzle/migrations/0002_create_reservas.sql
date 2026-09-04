CREATE TABLE public.reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE SET NULL,
  voo_id uuid REFERENCES public.voos(id) ON DELETE SET NULL,
  fornecedor text NOT NULL DEFAULT 'skyscanner',
  estado text NOT NULL DEFAULT 'iniciada',
  origem text NOT NULL,
  destino text NOT NULL,
  companhia text,
  numero_voo text,
  data_partida date,
  data_regresso date,
  preco numeric,
  moeda text NOT NULL DEFAULT 'EUR',
  deeplink text,
  referencia text,
  notas text,
  confirmada_em timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reservas TO authenticated;
GRANT ALL ON public.reservas TO service_role;

ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reservas proprias" ON public.reservas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX reservas_user_estado_idx ON public.reservas (user_id, estado, created_at DESC);
