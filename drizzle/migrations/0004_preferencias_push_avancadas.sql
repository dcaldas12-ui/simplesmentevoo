ALTER TABLE public.preferencias_avisos
  ADD COLUMN IF NOT EXISTS horas_tranquilas_ativas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hora_silencio_inicio smallint NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS hora_silencio_fim smallint NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS cat_reserva boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cat_cancelamento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cat_alteracao boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cat_lembrete boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS intervalo_minimo_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuso_horario text NOT NULL DEFAULT 'Europe/Lisbon',
  ADD COLUMN IF NOT EXISTS ultima_notificacao timestamptz;