import { Apple, BellRing, Smartphone, Wallet } from "lucide-react";

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

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Wallet className="size-5 text-primary" /> Adicionar à carteira digital
          </DialogTitle>
          <DialogDescription>
            Pré-visualização do passe. A ligação à carteira do telemóvel ainda não está ativa.
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

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Apple className="mt-0.5 size-4 shrink-0" />
            Passes reais na Apple Wallet exigem um certificado de passes da Apple.
          </li>
          <li className="flex gap-2">
            <Smartphone className="mt-0.5 size-4 shrink-0" />
            Na Google Wallet é preciso uma conta de emissor aprovada pela Google.
          </li>
          <li className="flex gap-2">
            <BellRing className="mt-0.5 size-4 shrink-0" />
            Avisos no ecrã bloqueado dependem das permissões de notificações do telemóvel.
          </li>
        </ul>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={() => onLigar(documento.id)} disabled={jaLigado}>
            {jaLigado ? "Ligação preparada" : "Preparar ligação à carteira"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
