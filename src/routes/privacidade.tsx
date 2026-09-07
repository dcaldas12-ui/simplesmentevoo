import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Simplesmente voo" },
      {
        name: "description",
        content:
          "Como a Simplesmente voo trata os seus dados pessoais: finalidades, bases legais, prazos e os seus direitos ao abrigo do RGPD.",
      },
      { property: "og:title", content: "Política de Privacidade — Simplesmente voo" },
      {
        property: "og:description",
        content: "Dados tratados, bases legais, prazos e direitos RGPD na Simplesmente voo.",
      },
    ],
  }),
  component: Privacidade,
});

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold">{titulo}</h2>
      <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Privacidade() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Política de Privacidade
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta política explica que dados a Simplesmente voo trata, porquê e durante quanto tempo,
          em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD).
        </p>

        <Seccao titulo="Que dados tratamos">
          <p>
            Dados de conta (email e identificador), viagens e voos que guardar, documentos que
            carregar e a informação deles extraída, avisos que criar, preferências (idioma,
            notificações, cache offline) e subscrições de notificações.
          </p>
        </Seccao>

        <Seccao titulo="Para que servem e com que base legal">
          <p>
            Execução do serviço que pediu (artigo 6.º, n.º 1, alínea b): conta, viagens, documentos
            e avisos. Consentimento (alínea a): análise de eventos que decida importar do
            calendário ou de emails, notificações push e guardar documentos para uso offline. Pode
            retirar o consentimento a qualquer momento.
          </p>
        </Seccao>

        <Seccao titulo="Documentos e análise automática">
          <p>
            Os ficheiros ficam num armazenamento privado, acessível apenas à sua conta. Para
            extrair dados de bilhetes e reservas, o conteúdo pode ser enviado a um serviço de
            inteligência artificial que o processa apenas para essa resposta. Não usamos os seus
            documentos para treinar modelos nem para publicidade.
          </p>
        </Seccao>

        <Seccao titulo="Importação do calendário e de emails">
          <p>
            Nada é lido sem uma ação sua. Os ficheiros .ics e os textos colados são analisados no
            seu dispositivo e só são guardados se escolher adicionar os eventos.
          </p>
        </Seccao>

        <Seccao titulo="Conservação e eliminação">
          <p>
            Guardamos os dados enquanto mantiver a conta. Pode apagar documentos, viagens e avisos
            individualmente, ou apagar a conta e todos os dados em{" "}
            <Link to="/conta" className="underline underline-offset-4">
              Conta e dados
            </Link>
            . A eliminação é imediata e definitiva.
          </p>
        </Seccao>

        <Seccao titulo="Os seus direitos">
          <p>
            Tem direito de acesso, retificação, apagamento, limitação, portabilidade e oposição, e
            pode apresentar reclamação à autoridade de controlo do seu país (em Portugal, a CNPD).
            Para exercer estes direitos, use as opções da app ou contacte-nos.
          </p>
        </Seccao>

        <Seccao titulo="Subcontratantes">
          <p>
            Usamos fornecedores de alojamento, base de dados e autenticação, e um fornecedor de
            inteligência artificial para a leitura de documentos. Os dados podem ser processados
            dentro e fora da UE, com as garantias contratuais aplicáveis.
          </p>
        </Seccao>

        <Seccao titulo="Contacto">
          <p>
            Para questões de privacidade, contacte o responsável pelo tratamento através do
            endereço indicado na página de{" "}
            <Link to="/ajuda" className="underline underline-offset-4">
              Ajuda
            </Link>
            .
          </p>
        </Seccao>
      </div>
    </AppShell>
  );
}
