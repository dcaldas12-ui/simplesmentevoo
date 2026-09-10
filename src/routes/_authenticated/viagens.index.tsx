import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BedDouble,
  CalendarDays,
  FileText,
  Info,
  Luggage,
  MapPin,
  Plus,
  Plane,
  Ticket,
  TrainFront,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { valoresIniciais } from "@/components/SearchForm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/viagens/")({
  head: () => ({
    meta: [
      { title: "As minhas viagens — ViatOrbis" },
      {
        name: "description",
        content:
          "Crie e organize as suas viagens, voos guardados e documentos associados.",
      },
      {
        property: "og:title",
        content: "As minhas viagens — ViatOrbis",
      },
      {
        property: "og:description",
        content:
          "Todas as suas viagens, voos e documentos organizados num só sítio.",
      },
    ],
  }),
  component: ViagensPage,
});

function formatarData(iso: string | null) {
  if (!iso) return null;

  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const organizacao = [
  {
    titulo: "Voos",
    descricao: "Adicione um voo manualmente.",
    icon: Plane,
    acao: "Adicionar voo",
    categoria: "voo",
  },
  {
    titulo: "Alojamento",
    descricao: "Guarde reservas de hotel e outros.",
    icon: BedDouble,
    acao: "Adicionar alojamento",
    categoria: "alojamento",
  },
  {
    titulo: "Transportes",
    descricao: "Comboios, autocarros, transfers e mais.",
    icon: TrainFront,
    acao: "Adicionar transporte",
    categoria: "transporte",
  },
  {
    titulo: "Bilhetes & vouchers",
    descricao: "Bilhetes, vouchers, códigos QR e outros.",
    icon: Ticket,
    acao: "Adicionar",
    categoria: "bilhete",
  },
  {
    titulo: "Documentos",
    descricao: "PDFs, imagens e documentos importantes.",
    icon: FileText,
    acao: "Adicionar documento",
    categoria: "documento",
  },
  {
    titulo: "Informações",
    descricao: "Notas e informações importantes.",
    icon: Info,
    acao: "Adicionar informação",
    categoria: "informacao",
  },
] as const;

type CategoriaAdicionar =
  | "voo"
  | "alojamento"
  | "transporte"
  | "bilhete"
  | "documento"
  | "informacao";

type AnexoCategoria = "alojamento" | "transporte" | "informacao";

type ViagemEscolha = {
  id: string;
  titulo: string;
  destino: string | null;
};

function validarFicheiro(file: File) {
  if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
    return "Formato não suportado. Escolha um PDF ou uma imagem.";
  }

  if (file.size > 20 * 1024 * 1024) {
    return "Ficheiro demasiado grande (máximo 20 MB).";
  }

  return null;
}

function nomeSeguroFicheiro(file: File) {
  return file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
}

async function carregarDocumento({
  viagemId,
  file,
}: {
  viagemId: string;
  file: File;
}) {
  const erro = validarFicheiro(file);
  if (erro) throw new Error(erro);

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  if (!uid) throw new Error("Sessão expirada.");

  const path = `${uid}/${viagemId}/${Date.now()}-${nomeSeguroFicheiro(file)}`;

  const { data: upload, error: erroUpload } = await supabase.storage
    .from("documentos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (erroUpload) throw erroUpload;

  const pathGuardado = upload?.path ?? null;

  if (!pathGuardado || pathGuardado.split("/")[0] !== uid) {
    if (pathGuardado) {
      await supabase.storage.from("documentos").remove([pathGuardado]);
    }

    throw new Error("O armazenamento não confirmou o caminho seguro do ficheiro.");
  }

  const { error } = await supabase.from("documentos").insert({
    viagem_id: viagemId,
    nome: file.name,
    tipo: "ficheiro",
    origem: "upload",
    ficheiro_path: pathGuardado,
    mime_type: file.type || null,
    tamanho_bytes: file.size,
  });

  if (error) {
    await supabase.storage.from("documentos").remove([pathGuardado]);
    throw error;
  }
}

async function carregarAnexo({
  viagemId,
  categoria,
  itemId,
  file,
}: {
  viagemId: string;
  categoria: AnexoCategoria;
  itemId: string;
  file: File;
}) {
  const erro = validarFicheiro(file);
  if (erro) throw new Error(erro);

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  if (!uid) throw new Error("Sessão expirada.");

  const path = `${uid}/${viagemId}/anexos/${categoria}/${itemId}/${Date.now()}-${nomeSeguroFicheiro(file)}`;

  const { data: upload, error: erroUpload } = await supabase.storage
    .from("documentos")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (erroUpload) throw erroUpload;

  const pathGuardado = upload?.path ?? null;

  if (!pathGuardado || pathGuardado.split("/")[0] !== uid) {
    if (pathGuardado) {
      await supabase.storage.from("documentos").remove([pathGuardado]);
    }

    throw new Error("O armazenamento não confirmou o caminho seguro do ficheiro.");
  }

  const { error } = await supabase.from("anexos_viagem").insert({
    user_id: uid,
    viagem_id: viagemId,
    categoria,
    item_id: itemId,
    nome: file.name,
    ficheiro_path: pathGuardado,
    mime_type: file.type || null,
    tamanho_bytes: file.size,
  });

  if (error) {
    await supabase.storage.from("documentos").remove([pathGuardado]);
    throw error;
  }
}

function FicheiroParaAdicionar({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;

          if (selected) {
            const erro = validarFicheiro(selected);

            if (erro) {
              toast.error(erro);
              e.currentTarget.value = "";
              return;
            }
          }

          onChange(selected);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Ficheiro</p>
          <p className="truncate text-xs text-muted-foreground">
            {file
              ? file.name
              : "Opcional — pode adicionar um PDF ou uma imagem."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {file ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                onChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remover
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {file ? "Alterar ficheiro" : "Adicionar ficheiro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdicionarItemDialog({
  categoria,
  viagens,
  aberto,
  onOpenChange,
  onDone,
}: {
  categoria: CategoriaAdicionar;
  viagens: ViagemEscolha[];
  aberto: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => Promise<void>;
}) {
  const [viagemId, setViagemId] = useState("");
  const [aGuardar, setAGuardar] = useState(false);
  const [ficheiro, setFicheiro] = useState<File | null>(null);

  const [voo, setVoo] = useState({
    companhia: "",
    numero_voo: "",
    origem: "",
    destino: "",
    partida: "",
    referencia: "",
    preco: "",
  });

  const [alojamento, setAlojamento] = useState({
    nome: "",
    morada: "",
    check_in: "",
    check_out: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  const [transporte, setTransporte] = useState({
    tipo: "",
    operador: "",
    origem: "",
    destino: "",
    partida: "",
    chegada: "",
    referencia: "",
    preco: "",
    notas: "",
  });

  const [informacao, setInformacao] = useState({
    titulo: "",
    conteudo: "",
  });

  useEffect(() => {
    if (!aberto) return;

    setViagemId(viagens[0]?.id ?? "");
    setFicheiro(null);
  }, [aberto, categoria, viagens]);

  function limpar() {
    setFicheiro(null);
    setVoo({
      companhia: "",
      numero_voo: "",
      origem: "",
      destino: "",
      partida: "",
      referencia: "",
      preco: "",
    });
    setAlojamento({
      nome: "",
      morada: "",
      check_in: "",
      check_out: "",
      referencia: "",
      preco: "",
      notas: "",
    });
    setTransporte({
      tipo: "",
      operador: "",
      origem: "",
      destino: "",
      partida: "",
      chegada: "",
      referencia: "",
      preco: "",
      notas: "",
    });
    setInformacao({ titulo: "", conteudo: "" });
  }

  async function guardar() {
    if (!viagemId) {
      toast.error("Crie primeiro uma viagem para poder adicionar este item.");
      return;
    }

    if (
      categoria === "voo" &&
      (!voo.origem.trim() || !voo.destino.trim())
    ) {
      toast.error("Indique a origem e o destino.");
      return;
    }

    if (categoria === "alojamento" && !alojamento.nome.trim()) {
      toast.error("Indique o nome do alojamento.");
      return;
    }

    if (categoria === "transporte" && !transporte.tipo.trim()) {
      toast.error("Indique o tipo de transporte.");
      return;
    }

    if (categoria === "informacao" && !informacao.titulo.trim()) {
      toast.error("Indique um título para a informação.");
      return;
    }

    if (
      categoria === "alojamento" &&
      alojamento.check_in &&
      alojamento.check_out &&
      alojamento.check_out < alojamento.check_in
    ) {
      toast.error("A data de check-out não pode ser anterior ao check-in.");
      return;
    }

    if (
      categoria === "transporte" &&
      transporte.partida &&
      transporte.chegada &&
      transporte.chegada < transporte.partida
    ) {
      toast.error("A chegada não pode ser anterior à partida.");
      return;
    }

    setAGuardar(true);

    try {
      if (categoria === "voo") {
        const { data, error } = await supabase
          .from("voos")
          .insert({
            viagem_id: viagemId,
            companhia: voo.companhia.trim() || null,
            numero_voo: voo.numero_voo.trim() || null,
            origem: voo.origem.trim().toUpperCase(),
            destino: voo.destino.trim().toUpperCase(),
            partida: voo.partida
              ? new Date(voo.partida).toISOString()
              : null,
            referencia: voo.referencia.trim() || null,
            preco: voo.preco ? Number(voo.preco) : null,
          })
          .select()
          .single();

        if (error) throw error;

        if (ficheiro) {
          try {
            await carregarDocumento({
              viagemId,
              file: ficheiro,
            });
          } catch (erroFicheiro) {
            await supabase.from("voos").delete().eq("id", data.id);
            throw erroFicheiro;
          }
        }
      }

      if (categoria === "alojamento") {
        const { data, error } = await supabase
          .from("alojamentos")
          .insert({
            viagem_id: viagemId,
            nome: alojamento.nome.trim(),
            morada: alojamento.morada.trim() || null,
            check_in: alojamento.check_in
              ? new Date(alojamento.check_in).toISOString()
              : null,
            check_out: alojamento.check_out
              ? new Date(alojamento.check_out).toISOString()
              : null,
            referencia: alojamento.referencia.trim() || null,
            preco: alojamento.preco ? Number(alojamento.preco) : null,
            notas: alojamento.notas.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        if (ficheiro) {
          try {
            await carregarAnexo({
              viagemId,
              categoria: "alojamento",
              itemId: data.id,
              file: ficheiro,
            });
          } catch (erroFicheiro) {
            await supabase.from("alojamentos").delete().eq("id", data.id);
            throw erroFicheiro;
          }
        }
      }

      if (categoria === "transporte") {
        const { data, error } = await supabase
          .from("transportes")
          .insert({
            viagem_id: viagemId,
            tipo: transporte.tipo.trim(),
            operador: transporte.operador.trim() || null,
            origem: transporte.origem.trim() || null,
            destino: transporte.destino.trim() || null,
            partida: transporte.partida
              ? new Date(transporte.partida).toISOString()
              : null,
            chegada: transporte.chegada
              ? new Date(transporte.chegada).toISOString()
              : null,
            referencia: transporte.referencia.trim() || null,
            preco: transporte.preco ? Number(transporte.preco) : null,
            notas: transporte.notas.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        if (ficheiro) {
          try {
            await carregarAnexo({
              viagemId,
              categoria: "transporte",
              itemId: data.id,
              file: ficheiro,
            });
          } catch (erroFicheiro) {
            await supabase.from("transportes").delete().eq("id", data.id);
            throw erroFicheiro;
          }
        }
      }

      if (categoria === "informacao") {
        const { data, error } = await supabase
          .from("informacoes")
          .insert({
            viagem_id: viagemId,
            titulo: informacao.titulo.trim(),
            conteudo: informacao.conteudo.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        if (ficheiro) {
          try {
            await carregarAnexo({
              viagemId,
              categoria: "informacao",
              itemId: data.id,
              file: ficheiro,
            });
          } catch (erroFicheiro) {
            await supabase.from("informacoes").delete().eq("id", data.id);
            throw erroFicheiro;
          }
        }
      }

      if (categoria === "documento" || categoria === "bilhete") {
        if (!ficheiro) {
          throw new Error("Selecione um ficheiro para adicionar.");
        }

        await carregarDocumento({
          viagemId,
          file: ficheiro,
        });
      }

      await onDone();

      toast.success(
        ficheiro
          ? "Item e ficheiro adicionados."
          : "Item adicionado.",
      );

      onOpenChange(false);
      limpar();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o item.",
      );
    } finally {
      setAGuardar(false);
    }
  }

  const titulos: Record<CategoriaAdicionar, string> = {
    voo: "Adicionar voo",
    alojamento: "Adicionar alojamento",
    transporte: "Adicionar transporte",
    bilhete: "Adicionar bilhete ou voucher",
    documento: "Adicionar documento",
    informacao: "Adicionar informação",
  };

  const descricoes: Record<CategoriaAdicionar, string> = {
    voo: "Registe os dados do voo e, se quiser, associe um ficheiro.",
    alojamento: "Guarde os dados do hotel, apartamento ou outro alojamento.",
    transporte: "Registe comboios, autocarros, transfers ou outros transportes.",
    bilhete: "Carregue o bilhete, voucher, código QR ou comprovativo.",
    documento: "Carregue um PDF, imagem ou outro documento da viagem.",
    informacao: "Guarde uma nota, morada, código ou outra informação útil.",
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulos[categoria]}</DialogTitle>
          <DialogDescription>{descricoes[categoria]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor={`viagem-${categoria}`}>Viagem</Label>
            <select
              id={`viagem-${categoria}`}
              value={viagemId}
              onChange={(e) => setViagemId(e.target.value)}
              disabled={viagens.length === 0 || aGuardar}
              className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecionar viagem</option>
              {viagens.map((viagem) => (
                <option key={viagem.id} value={viagem.id}>
                  {viagem.titulo}
                  {viagem.destino ? ` — ${viagem.destino}` : ""}
                </option>
              ))}
            </select>
          </div>

          {categoria === "voo" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="add-voo-origem">Origem</Label>
                <Input
                  id="add-voo-origem"
                  value={voo.origem}
                  onChange={(e) =>
                    setVoo({ ...voo, origem: e.target.value.toUpperCase() })
                  }
                  className="mt-1.5 uppercase"
                />
              </div>
              <div>
                <Label htmlFor="add-voo-destino">Destino</Label>
                <Input
                  id="add-voo-destino"
                  value={voo.destino}
                  onChange={(e) =>
                    setVoo({ ...voo, destino: e.target.value.toUpperCase() })
                  }
                  className="mt-1.5 uppercase"
                />
              </div>
              <div>
                <Label htmlFor="add-voo-companhia">Companhia</Label>
                <Input
                  id="add-voo-companhia"
                  value={voo.companhia}
                  onChange={(e) => setVoo({ ...voo, companhia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-voo-numero">Número do voo</Label>
                <Input
                  id="add-voo-numero"
                  value={voo.numero_voo}
                  onChange={(e) => setVoo({ ...voo, numero_voo: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-voo-partida">Partida</Label>
                <Input
                  id="add-voo-partida"
                  type="datetime-local"
                  value={voo.partida}
                  onChange={(e) => setVoo({ ...voo, partida: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-voo-preco">Preço (EUR)</Label>
                <Input
                  id="add-voo-preco"
                  type="number"
                  step="0.01"
                  value={voo.preco}
                  onChange={(e) => setVoo({ ...voo, preco: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="add-voo-referencia">Referência da reserva</Label>
                <Input
                  id="add-voo-referencia"
                  value={voo.referencia}
                  onChange={(e) => setVoo({ ...voo, referencia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          ) : null}

          {categoria === "alojamento" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="add-alojamento-nome">Nome</Label>
                <Input
                  id="add-alojamento-nome"
                  value={alojamento.nome}
                  onChange={(e) => setAlojamento({ ...alojamento, nome: e.target.value })}
                  placeholder="Hotel ou alojamento"
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="add-alojamento-morada">Morada</Label>
                <Input
                  id="add-alojamento-morada"
                  value={alojamento.morada}
                  onChange={(e) => setAlojamento({ ...alojamento, morada: e.target.value })}
                  placeholder="Rua, número, cidade"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-alojamento-checkin">Check-in</Label>
                <Input
                  id="add-alojamento-checkin"
                  type="datetime-local"
                  value={alojamento.check_in}
                  onChange={(e) => setAlojamento({ ...alojamento, check_in: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-alojamento-checkout">Check-out</Label>
                <Input
                  id="add-alojamento-checkout"
                  type="datetime-local"
                  value={alojamento.check_out}
                  onChange={(e) => setAlojamento({ ...alojamento, check_out: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-alojamento-referencia">Referência</Label>
                <Input
                  id="add-alojamento-referencia"
                  value={alojamento.referencia}
                  onChange={(e) => setAlojamento({ ...alojamento, referencia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-alojamento-preco">Preço (EUR)</Label>
                <Input
                  id="add-alojamento-preco"
                  type="number"
                  step="0.01"
                  value={alojamento.preco}
                  onChange={(e) => setAlojamento({ ...alojamento, preco: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="add-alojamento-notas">Notas</Label>
                <Textarea
                  id="add-alojamento-notas"
                  value={alojamento.notas}
                  onChange={(e) => setAlojamento({ ...alojamento, notas: e.target.value })}
                  placeholder="Informações importantes..."
                  className="mt-1.5 min-h-24"
                />
              </div>
            </div>
          ) : null}

          {categoria === "transporte" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="add-transporte-tipo">Tipo</Label>
                <Input
                  id="add-transporte-tipo"
                  value={transporte.tipo}
                  onChange={(e) => setTransporte({ ...transporte, tipo: e.target.value })}
                  placeholder="Comboio, autocarro, transfer..."
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-operador">Operador</Label>
                <Input
                  id="add-transporte-operador"
                  value={transporte.operador}
                  onChange={(e) => setTransporte({ ...transporte, operador: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-origem">Origem</Label>
                <Input
                  id="add-transporte-origem"
                  value={transporte.origem}
                  onChange={(e) => setTransporte({ ...transporte, origem: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-destino">Destino</Label>
                <Input
                  id="add-transporte-destino"
                  value={transporte.destino}
                  onChange={(e) => setTransporte({ ...transporte, destino: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-partida">Partida</Label>
                <Input
                  id="add-transporte-partida"
                  type="datetime-local"
                  value={transporte.partida}
                  onChange={(e) => setTransporte({ ...transporte, partida: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-chegada">Chegada</Label>
                <Input
                  id="add-transporte-chegada"
                  type="datetime-local"
                  value={transporte.chegada}
                  onChange={(e) => setTransporte({ ...transporte, chegada: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-referencia">Referência</Label>
                <Input
                  id="add-transporte-referencia"
                  value={transporte.referencia}
                  onChange={(e) => setTransporte({ ...transporte, referencia: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-transporte-preco">Preço (EUR)</Label>
                <Input
                  id="add-transporte-preco"
                  type="number"
                  step="0.01"
                  value={transporte.preco}
                  onChange={(e) => setTransporte({ ...transporte, preco: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="add-transporte-notas">Notas</Label>
                <Textarea
                  id="add-transporte-notas"
                  value={transporte.notas}
                  onChange={(e) => setTransporte({ ...transporte, notas: e.target.value })}
                  className="mt-1.5 min-h-24"
                />
              </div>
            </div>
          ) : null}

          {categoria === "informacao" ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="add-informacao-titulo">Título</Label>
                <Input
                  id="add-informacao-titulo"
                  value={informacao.titulo}
                  onChange={(e) => setInformacao({ ...informacao, titulo: e.target.value })}
                  placeholder="Morada do alojamento"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="add-informacao-conteudo">Informação</Label>
                <Textarea
                  id="add-informacao-conteudo"
                  value={informacao.conteudo}
                  onChange={(e) => setInformacao({ ...informacao, conteudo: e.target.value })}
                  placeholder="Escreva aqui a informação..."
                  className="mt-1.5 min-h-28"
                />
              </div>
            </div>
          ) : null}

          {categoria === "documento" || categoria === "bilhete" ? (
            <div>
              <Label>Ficheiro</Label>
              <FicheiroParaAdicionar
                file={ficheiro}
                onChange={setFicheiro}
                disabled={aGuardar}
              />
            </div>
          ) : (
            <FicheiroParaAdicionar
              file={ficheiro}
              onChange={setFicheiro}
              disabled={aGuardar}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={aGuardar}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => void guardar()}
            disabled={aGuardar || !viagemId || viagens.length === 0}
          >
            {aGuardar ? "A guardar..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function ViagensPage() {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<CategoriaAdicionar | null>(null);

  const [form, setForm] = useState({
    titulo: "",
    destino: "",
    data_inicio: "",
    data_fim: "",
    notas: "",
  });

  const { data: viagens, isLoading } = useQuery({
    queryKey: ["viagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select(
          "id, titulo, destino, data_inicio, data_fim, estado, voos(count), documentos(count), alojamentos(count), transportes(count), informacoes(count)",
        )
        .order("data_inicio", {
          ascending: true,
          nullsFirst: false,
        });

      if (error) throw error;

      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("viagens").insert({
        titulo: form.titulo,
        destino: form.destino || null,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        notas: form.notas || null,
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["viagens"],
      });

      toast.success("Viagem criada.");

      setAberto(false);

      setForm({
        titulo: "",
        destino: "",
        data_inicio: "",
        data_fim: "",
        notas: "",
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : "Erro ao criar viagem.",
      ),
  });

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              As minhas viagens
            </h1>

            <p className="text-sm text-muted-foreground">
              Organize tudo o que pertence a cada viagem num só sítio.
            </p>
          </div>

          <Dialog open={aberto} onOpenChange={setAberto}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Nova viagem
              </Button>
            </DialogTrigger>

            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova viagem</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="titulo">Nome da viagem</Label>

                  <Input
                    id="titulo"
                    value={form.titulo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        titulo: e.target.value,
                      })
                    }
                    placeholder="Férias em Barcelona"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <Label htmlFor="destino">Destino</Label>

                  <Input
                    id="destino"
                    value={form.destino}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        destino: e.target.value,
                      })
                    }
                    placeholder="Barcelona"
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="inicio">Início</Label>

                    <Input
                      id="inicio"
                      type="date"
                      value={form.data_inicio}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          data_inicio: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fim">Fim</Label>

                    <Input
                      id="fim"
                      type="date"
                      value={form.data_fim}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          data_fim: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notas">Notas</Label>

                  <Textarea
                    id="notas"
                    value={form.notas}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        notas: e.target.value,
                      })
                    }
                    placeholder="Informações adicionais sobre a viagem..."
                    className="mt-1.5"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => criar.mutate()}
                  disabled={!form.titulo.trim() || criar.isPending}
                >
                  {criar.isPending ? "A criar..." : "Criar viagem"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <section className="mt-8">
          <div>
            <h2 className="font-display text-lg font-semibold">
              Organize a sua viagem
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Tudo o que pode guardar e organizar nas suas viagens.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {organizacao.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.titulo}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold">
                        {item.titulo}
                      </h3>

                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.descricao}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant={item.categoria === "documento" || item.categoria === "bilhete" ? "outline" : "default"}
                      className="h-8 text-xs"
                      onClick={() => setCategoriaAberta(item.categoria)}
                    >
                      <Plus className="size-3.5" />
                      {item.acao}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <AdicionarItemDialog
            categoria={categoriaAberta ?? "documento"}
            viagens={
              (viagens ?? []).map((v) => ({
                id: v.id,
                titulo: v.titulo,
                destino: v.destino,
              }))
            }
            aberto={categoriaAberta !== null}
            onOpenChange={(open) => {
              if (!open) setCategoriaAberta(null);
            }}
            onDone={async () => {
              await queryClient.invalidateQueries({ queryKey: ["viagens"] });
            }}
          />
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">
                As minhas Viagens
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                Cada viagem reúne os seus voos, documentos e restantes
                informações.
              </p>
            </div>

            {viagens && viagens.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {viagens.length}{" "}
                {viagens.length === 1 ? "viagem" : "viagens"}
              </span>
            ) : null}
          </div>

          <div className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-36 rounded-2xl"
                  />
                ))}
              </div>
            ) : !viagens || viagens.length === 0 ? (
              <EmptyState
                icon={Luggage}
                titulo="Ainda não tem viagens"
                descricao="Crie a sua primeira viagem ou pesquise voos para começar a organizar a sua viagem."
              >
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setAberto(true)}>
                    <Plus className="size-4" />
                    Criar viagem
                  </Button>

                  <Button asChild variant="outline">
                    <Link
                      to="/pesquisa"
                      search={{
                        ...valoresIniciais,
                        apenasDiretos: false,
                        executar: 1,
                      }}
                    >
                      <Plane className="size-4" />
                      Pesquisar voos
                    </Link>
                  </Button>
                </div>
              </EmptyState>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {viagens.map((v) => {
                  const quantidadeVoos = v.voos?.[0]?.count ?? 0;
                  const quantidadeDocumentos =
                    v.documentos?.[0]?.count ?? 0;
                  const quantidadeAlojamentos =
                    v.alojamentos?.[0]?.count ?? 0;
                  const quantidadeTransportes =
                    v.transportes?.[0]?.count ?? 0;
                  const quantidadeInformacoes =
                    v.informacoes?.[0]?.count ?? 0;

                  return (
                    <li key={v.id}>
                      <Link
                        to="/viagens/$viagemId"
                        params={{
                          viagemId: v.id,
                        }}
                        className="block h-full rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate font-display text-lg font-semibold">
                              {v.titulo}
                            </h3>

                            {v.destino ? (
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                                <MapPin className="size-4 shrink-0" />
                                <span className="truncate">
                                  {v.destino}
                                </span>
                              </p>
                            ) : null}
                          </div>

                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                            <Luggage className="size-4" />
                          </div>
                        </div>

                        {v.data_inicio ? (
                          <p className="mt-4 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CalendarDays className="size-4 shrink-0" />

                            <span>
                              {formatarData(v.data_inicio)}

                              {v.data_fim
                                ? ` — ${formatarData(v.data_fim)}`
                                : ""}
                            </span>
                          </p>
                        ) : null}

                        <div className="mt-5 flex flex-wrap gap-2">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            {quantidadeVoos}{" "}
                            {quantidadeVoos === 1 ? "voo" : "voos"}
                          </span>

                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            {quantidadeDocumentos}{" "}
                            {quantidadeDocumentos === 1
                              ? "documento"
                              : "documentos"}
                          </span>

                          {quantidadeAlojamentos > 0 ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                              {quantidadeAlojamentos}{" "}
                              {quantidadeAlojamentos === 1
                                ? "alojamento"
                                : "alojamentos"}
                            </span>
                          ) : null}

                          {quantidadeTransportes > 0 ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                              {quantidadeTransportes}{" "}
                              {quantidadeTransportes === 1
                                ? "transporte"
                                : "transportes"}
                            </span>
                          ) : null}

                          {quantidadeInformacoes > 0 ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                              {quantidadeInformacoes}{" "}
                              {quantidadeInformacoes === 1
                                ? "informação"
                                : "informações"}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}