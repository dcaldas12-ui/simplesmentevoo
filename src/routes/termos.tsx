import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos e Condições — Simplesmente voo" },
      {
        name: "description",
        content:
          "Regras de utilização da Simplesmente voo: âmbito do serviço, responsabilidades, reservas com parceiros e cessação da conta.",
      },
      { property: "og:title", content: "Termos e Condições — Simplesmente voo" },
      {
        property: "og:description",
        content: "Âmbito do serviço, responsabilidades e regras de utilização da Simplesmente voo.",
      },
    ],
  }),
  component: Termos,
});

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Termos() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Termos e Condições</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ao usar a Simplesmente voo aceita estas condições. Leia também a{" "}
          <Link to="/privacidade" className="underline underline-offset-4">
            Política de Privacidade
          </Link>
          .
        </p>

        <Seccao titulo="O que a app faz">
          <p>
            A Simplesmente voo ajuda a comparar datas e preços de voos, a organizar viagens e
            documentos e a criar avisos. Enquanto não estiver ligada a uma fonte de preços real, os
            resultados apresentados são exemplos claramente identificados como demonstração.
          </p>
        </Seccao>

        <Seccao titulo="Reservas e pagamentos">
          <p>
            Não vendemos viagens nem processamos pagamentos. As reservas são concluídas nos sites
            dos parceiros, sujeitas às condições e preços desses parceiros no momento da compra.
          </p>
        </Seccao>

        <Seccao titulo="A sua conta">
          <p>
            É responsável por manter as credenciais seguras e pelo conteúdo que carrega. Não
            carregue documentos de terceiros sem autorização.
          </p>
        </Seccao>

        <Seccao titulo="Avisos e notificações">
          <p>
            Os avisos são um apoio e dependem do seu dispositivo, das permissões concedidas e da
            ligação à internet. Confirme sempre horários e requisitos junto da companhia ou do
            fornecedor.
          </p>
        </Seccao>

        <Seccao titulo="Limitação de responsabilidade">
          <p>
            O serviço é prestado tal como está. Não garantimos a exatidão de dados extraídos
            automaticamente de documentos nem de preços de terceiros. Nada nestes termos afasta os
            direitos que a lei de consumo da UE lhe confere.
          </p>
        </Seccao>

        <Seccao titulo="Cessação">
          <p>
            Pode apagar a conta e todos os dados a qualquer momento em{" "}
            <Link to="/conta" className="underline underline-offset-4">
              Conta e dados
            </Link>
            . Podemos suspender contas em caso de uso abusivo ou ilegal.
          </p>
        </Seccao>

        <Seccao titulo="Lei aplicável">
          <p>
            Aplica-se a lei portuguesa e, quando aplicável, o direito da União Europeia, sem
            prejuízo das normas imperativas do país onde reside.
          </p>
        </Seccao>
      </div>
    </AppShell>
  );
}
