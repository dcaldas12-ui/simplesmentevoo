import { createFileRoute } from "@tanstack/react-router";
import { Apple, BellRing, Rocket, Smartphone, TriangleAlert } from "lucide-react";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ajuda")({
  component: Ajuda,
  head: () => ({
    meta: [
      { title: "Ajuda — instalar e ativar avisos | Simplesmente voo" },
      {
        name: "description",
        content:
          "Como publicar a Simplesmente voo, instalar no iPhone e Android e ativar notificações depois de adicionar ao ecrã principal.",
      },
      { property: "og:title", content: "Ajuda — instalar e ativar avisos | Simplesmente voo" },
      {
        property: "og:description",
        content:
          "Passos simples para instalar a Simplesmente voo no telemóvel e ligar os avisos, com as limitações de cada sistema.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Passos({
  titulo,
  icone: Icone,
  passos,
  nota,
}: {
  titulo: string;
  icone: typeof Apple;
  passos: string[];
  nota?: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Icone className="size-5 text-primary" aria-hidden /> {titulo}
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        {passos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      {nota ? <p className="mt-3 text-xs text-muted-foreground">{nota}</p> : null}
    </section>
  );
}

function Ajuda() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Ajuda</h1>
        <p className="mt-2 text-muted-foreground">
          Como pôr a Simplesmente voo no telemóvel e ligar os avisos. Cada passo indica também o que
          o sistema do telemóvel não permite.
        </p>

        <div className="mt-8 space-y-5">
          <Passos
            titulo="1. Publicar a app"
            icone={Rocket}
            passos={[
              "No editor, use o botão Publicar para colocar a app online num endereço seguro (https).",
              "Guarde o endereço publicado: é esse que deve abrir no telemóvel.",
              "A pré-visualização do editor serve para experimentar, mas instalação e notificações só funcionam de forma fiável no endereço publicado.",
            ]}
            nota="Enquanto não publicar, a app não está online para outras pessoas."
          />

          <Passos
            titulo="2. Instalar no iPhone (iOS/iPadOS)"
            icone={Apple}
            passos={[
              "Abra o endereço publicado no Safari (tem de ser o Safari).",
              "Toque no botão Partilhar (quadrado com seta para cima).",
              "Escolha “Adicionar ao ecrã principal” e confirme.",
              "Abra a app pelo novo ícone, e não pelo Safari.",
            ]}
            nota="No iPhone, os avisos só funcionam se a app for aberta pelo ícone do ecrã principal e o iOS for recente. Não há instalação a partir do Chrome no iPhone."
          />

          <Passos
            titulo="3. Instalar no Android"
            icone={Smartphone}
            passos={[
              "Abra o endereço publicado no Chrome.",
              "Toque no menu (três pontos) e escolha “Instalar aplicação” ou “Adicionar ao ecrã principal”.",
              "Confirme e abra a app pelo ícone criado.",
            ]}
            nota="Alguns telemóveis mostram automaticamente um aviso de instalação; se não aparecer, use o menu."
          />

          <Passos
            titulo="4. Ativar as notificações"
            icone={BellRing}
            passos={[
              "Abra a app pelo ícone do ecrã principal.",
              "Vá a Avisos e toque em ativar notificações neste dispositivo.",
              "Aceite o pedido de permissão do telemóvel. Se recusou antes, terá de a autorizar nas definições do sistema.",
              "Use o envio de teste para confirmar que chega uma notificação.",
              "Em Preferências de notificações, escolha horas tranquilas, tipos de aviso e frequência.",
            ]}
            nota="As notificações só saem se o servidor tiver as chaves de envio configuradas; a página de Avisos mostra esse estado com honestidade."
          />

          <section className="rounded-2xl border border-border bg-secondary/40 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <TriangleAlert className="size-5 text-primary" aria-hidden /> Limitações a conhecer
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Passes oficiais de Apple Wallet e Google Wallet ainda não estão disponíveis: exigem
                um certificado de programador Apple e uma conta de emissor Google. Por agora
                oferecemos um evento de calendário com lembretes.
              </li>
              <li>
                O modo sem internet guarda apenas texto (datas, locais, referências) neste
                dispositivo e só se o autorizar. Nunca guarda os ficheiros PDF nem partilha dados
                entre contas.
              </li>
              <li>
                Avisos no ecrã bloqueado dependem das permissões e do modo de poupança de bateria
                do telemóvel; o sistema pode atrasar ou agrupar notificações.
              </li>
              <li>
                Os preços de voos são de demonstração enquanto não houver acesso aprovado e chave
                válida do fornecedor de voos.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
