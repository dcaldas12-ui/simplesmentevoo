import { Apple, BellRing, CalendarPlus, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentoViagem } from "@/lib/documentos";
import { formatarDataHora } from "@/lib/documentos";
import { avaliarWallet, descarregarICS, type ItemWallet } from "@/lib/wallet";

export function WalletDialog({
  documento,
  aberto,
  onFechar,
  onLigar,
}: {
  documento: DocumentoViagem | null;
  aberto: boolean;
  onFechar: () => void;
  onLigar: (id: string) => void;
}) {
  if (!documento) return null;
  const jaLigado = documento.wallet === "ligado";

  const item: ItemWallet = {
    id: documento.id,
    titulo: documento.ficha.tipoDocumento
      ? `${documento.ficha.tipoDocumento} — ${documento.nome}`
      : documento.nome,
    descricao: [documento.ficha.fornecedor, documento.ficha.passageiro].filter(Boolean).join(" · "),
    ...(documento.ficha.local ? { local: documento.ficha.local } : {}),
    inicio: documento.ficha.dataHora ?? null,
    ...(documento.ficha.referencia ? { referencia: documento.ficha.referencia } : {}),
  };
  const prontidao = avaliarWallet(item);

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wallet className="size-5 text-primary" aria-hidden /> Adicionar à carteira digital
          </DialogTitle>
          <DialogDescription>
            Pode guardar já o evento no calendário do telemóvel. Passes oficiais de Apple Wallet e
            Google Wallet exigem credenciais que ainda não estão configuradas.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-border bg-gradient-to-br from-secondary to-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {documento.ficha.tipoDocumento || "Documento de viagem"}
          </p>
          <p className="mt-1 font-display text-lg font-semibold">{documento.nome}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Passageiro</p>
              <p className="truncate">{documento.ficha.passageiro || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Referência</p>
              <p className="truncate">{documento.ficha.referencia || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Local</p>
              <p className="truncate">{documento.ficha.local || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Quando</p>
              <p className="truncate">{formatarDataHora(documento.ficha.dataHora)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Disponível agora</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {prontidao.podeGerarCalendario
              ? "Criamos um evento com lembrete 2 horas antes, que o iPhone e o Android abrem diretamente no calendário."
              : prontidao.motivo}
          </p>
          <Button
            className="mt-3 min-h-11 w-full sm:w-auto"
            disabled={!prontidao.podeGerarCalendario}
            onClick={() => {
              descarregarICS(item);
              toast.success("Evento criado", {
                description: "Abra o ficheiro para o guardar no calendário do telemóvel.",
              });
            }}
          >
            <CalendarPlus className="mr-2 size-4" aria-hidden /> Guardar no calendário
          </Button>
        </div>

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Apple className="mt-0.5 size-4 shrink-0" aria-hidden />
            Passe na Apple Wallet: falta um certificado de passes da Apple (conta de programador).
          </li>
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            Passe na Google Wallet: falta uma conta de emissor aprovada pela Google.
          </li>
          <li className="flex gap-2">
            <BellRing className="mt-0.5 size-4 shrink-0" aria-hidden />
            Avisos no ecrã bloqueado dependem das permissões de notificações do telemóvel.
          </li>
        </ul>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="min-h-11" onClick={onFechar}>
            Fechar
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onLigar(documento.id)}
            disabled={jaLigado}
          >
            {jaLigado ? "Marcado para a carteira" : "Marcar para a carteira"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
