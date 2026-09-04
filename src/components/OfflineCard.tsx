import { CloudDownload, Lock, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/lib/auth";
import type { DocumentoViagem } from "@/lib/documentos";
import { formatarDataHora } from "@/lib/documentos";
import {
  donoAtual,
  guardarOffline,
  lerOffline,
  limparCacheDeOutrasContas,
  limparOffline,
  tamanhoAproximado,
  type EstadoOffline,
} from "@/lib/offline-cache";

export function OfflineCard({
  documentos,
  viagem,
}: {
  documentos: DocumentoViagem[];
  viagem: { titulo: string; periodo: string };
}) {
  const { user } = useSession();
  const dono = donoAtual(user?.id ?? null);
  const [estado, setEstado] = useState<EstadoOffline>({
    consentimento: false,
    selecionados: [],
    conteudo: null,
  });
  const [tamanho, setTamanho] = useState(0);

  useEffect(() => {
    limparCacheDeOutrasContas(dono);
    setEstado(lerOffline(dono));
    setTamanho(tamanhoAproximado(dono));
  }, [dono]);

  function aplicar(novo: EstadoOffline) {
    const conteudo = novo.consentimento
      ? {
          atualizadoEm: new Date().toISOString(),
          viagem,
          documentos: documentos
            .filter((d) => novo.selecionados.includes(d.id))
            .map((d) => ({
              id: d.id,
              nome: d.nome,
              tipoDocumento: d.ficha.tipoDocumento ?? "",
              quando: formatarDataHora(d.ficha.dataHora),
              local: d.ficha.local ?? "",
              referencia: d.ficha.referencia ?? "",
            })),
        }
      : null;
    const final = { ...novo, conteudo };
    setEstado(final);
    if (novo.consentimento) guardarOffline(dono, final);
    else limparOffline(dono);
    setTamanho(tamanhoAproximado(dono));
  }

  function alternarConsentimento(v: boolean) {
    aplicar({ ...estado, consentimento: v, selecionados: v ? estado.selecionados : [] });
    toast.success(
      v ? "Modo offline ativado neste dispositivo." : "Cache offline apagada deste dispositivo.",
    );
  }

  function alternarDocumento(id: string, v: boolean) {
    const selecionados = v
      ? [...new Set([...estado.selecionados, id])]
      : estado.selecionados.filter((x) => x !== id);
    aplicar({ ...estado, selecionados });
  }

  return (
    <section
      className="rounded-2xl border border-border bg-card p-5"
      aria-labelledby="offline-titulo"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <CloudDownload className="size-5 text-primary" aria-hidden />
          </div>
          <div>
            <h2 id="offline-titulo" className="font-display text-lg font-semibold">
              Ver sem internet (opcional)
            </h2>
            <p className="text-sm text-muted-foreground">
              Guarda neste telemóvel os dados da próxima viagem e dos documentos que escolher.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span>{estado.consentimento ? "Ativo" : "Desligado"}</span>
          <Switch
            checked={estado.consentimento}
            onCheckedChange={alternarConsentimento}
            aria-label="Guardar dados desta viagem neste dispositivo"
          />
        </label>
      </div>

      <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        Guardamos apenas texto (nome, datas, local e referência), nunca os ficheiros PDF nem os QR
        originais. Fica só neste dispositivo, separado por conta: ao entrar noutra conta, os dados da
        anterior são apagados. Em telemóveis partilhados, mantenha esta opção desligada.
      </p>

      {estado.consentimento ? (
        <>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {documentos.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                Ainda não há documentos nesta viagem para guardar.
              </li>
            ) : (
              documentos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatarDataHora(d.ficha.dataHora)}
                    </p>
                  </div>
                  <Switch
                    checked={estado.selecionados.includes(d.id)}
                    onCheckedChange={(v) => alternarDocumento(d.id, v)}
                    aria-label={`Guardar ${d.nome} para ver sem internet`}
                  />
                </li>
              ))
            )}
          </ul>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {estado.selecionados.length} documento(s) guardados · cerca de{" "}
              {Math.max(1, Math.round(tamanho / 1024))} KB
              {estado.conteudo
                ? ` · atualizado às ${new Date(estado.conteudo.atualizadoEm).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                limparOffline(dono);
                setEstado({ consentimento: false, selecionados: [], conteudo: null });
                setTamanho(0);
                toast.success("Cache offline removida deste dispositivo.");
              }}
            >
              <Trash2 className="mr-2 size-4" aria-hidden /> Remover cache deste dispositivo
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
