import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  camposDaFicha,
  camposPorConfirmar,
  type DocumentoViagem,
  type FichaDocumento,
} from "@/lib/documentos";

const categorias: Array<{ valor: string; rotulo: string }> = [
  { valor: "voo", rotulo: "Voo" },
  { valor: "hotel", rotulo: "Alojamento" },
  { valor: "transfer", rotulo: "Transfer" },
  { valor: "outro", rotulo: "Outro" },
];


export function DocumentoFicha({
  documento,
  aberto,
  onFechar,
  onGuardar,
}: {
  documento: DocumentoViagem | null;
  aberto: boolean;
  onFechar: () => void;
  onGuardar: (id: string, ficha: FichaDocumento, destacar: boolean) => void;
}) {
  const [ficha, setFicha] = useState<FichaDocumento | null>(null);
  const [destacar, setDestacar] = useState(false);

  useEffect(() => {
    if (documento) {
      setFicha({ ...documento.ficha });
      setDestacar(documento.destacar);
    }
  }, [documento]);

  if (!documento || !ficha) return null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Ficha do documento</DialogTitle>
          <DialogDescription>
            {documento.notaAnalise ?? "Reveja e complete os dados deste documento."}
          </DialogDescription>
        </DialogHeader>

        {documento.estadoAnalise === "concluida" ? (
          <p className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            <Sparkles className="size-4 text-primary" /> Campos preenchidos por leitura automática —
            pode corrigir tudo.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.chave} className={c.chave === "codigo" ? "sm:col-span-2" : undefined}>
              <Label htmlFor={`ficha-${c.chave}`}>{c.rotulo}</Label>
              <Input
                id={`ficha-${c.chave}`}
                type={c.tipo ?? "text"}
                value={ficha[c.chave]}
                onChange={(e) => setFicha({ ...ficha, [c.chave]: e.target.value })}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div className="pr-4">
            <p className="text-sm font-medium">Destacar em “Para usar em breve”</p>
            <p className="text-xs text-muted-foreground">
              Usa a data e hora acima para ordenar os documentos mais próximos.
            </p>
          </div>
          <Switch checked={destacar} onCheckedChange={setDestacar} aria-label="Destacar documento" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>
            Cancelar
          </Button>
          <Button onClick={() => onGuardar(documento.id, ficha, destacar)}>Guardar ficha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
