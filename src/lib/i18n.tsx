import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Idioma = "pt" | "en" | "fr";

export const IDIOMAS: Array<{ valor: Idioma; rotulo: string }> = [
  { valor: "pt", rotulo: "Português" },
  { valor: "en", rotulo: "English" },
  { valor: "fr", rotulo: "Français" },
];

const CHAVE = "simplesmentevoo.idioma";

/** Português é a base: as outras línguas caem para o texto português quando falta. */
const pt = {
  "nav.pesquisar": "Pesquisar",
  "nav.viagens": "Viagens",
  "nav.reservas": "Reservas",
  "nav.documentos": "Documentos",
  "nav.avisos": "Avisos",
  "nav.importar": "Importar",
  "nav.ajuda": "Ajuda",
  "nav.entrar": "Entrar",
  "nav.sair": "Sair",
  "rodape.slogan": "Simplesmente voo — encontre as melhores datas e preços, sem complicações.",
  "rodape.ajuda": "Ajuda e instalação",
  "rodape.privacidade": "Privacidade",
  "rodape.termos": "Termos",
  "idioma.rotulo": "Idioma",

  "consent.titulo": "A sua privacidade",
  "consent.texto":
    "Usamos apenas o armazenamento necessário para a app funcionar (sessão, preferências e cache offline que escolher). Não usamos publicidade nem seguimento de terceiros.",
  "consent.aceitar": "Compreendi",
  "consent.saber": "Ler a política de privacidade",

  "importar.titulo": "Encontrar eventos de viagem no seu telemóvel",
  "importar.intro":
    "Com a sua autorização, procuramos voos, hotéis, transfers e outros eventos de viagem e sugerimos adicioná-los. Nada é lido sem que carregue no botão.",
  "importar.consentimento":
    "Autorizo a Simplesmente voo a analisar os eventos que eu escolher partilhar, apenas para sugerir viagens e avisos.",
  "importar.escolher": "Escolher ficheiro do calendário (.ics)",
  "importar.colar": "Ou cole aqui o texto de um email ou convite",
  "importar.analisar": "Procurar eventos de viagem",
  "importar.nenhum": "Não encontrámos eventos de viagem neste conteúdo.",
  "importar.encontrados": "Eventos encontrados",
  "importar.adicionar": "Adicionar os selecionados",
  "importar.ligarGoogle": "Ligar conta Google (Calendário e Gmail)",
  "importar.privacidade":
    "Os eventos são analisados no seu dispositivo e só são guardados na sua conta se escolher adicioná-los. Pode apagar tudo a qualquer momento.",

  "legal.privacidade": "Política de Privacidade",
  "legal.termos": "Termos e Condições",
  "conta.apagar": "Apagar a minha conta e dados",
} as const;

export type ChaveTexto = keyof typeof pt;

const en: Partial<Record<ChaveTexto, string>> = {
  "nav.pesquisar": "Search",
  "nav.viagens": "Trips",
  "nav.reservas": "Bookings",
  "nav.documentos": "Documents",
  "nav.avisos": "Alerts",
  "nav.importar": "Import",
  "nav.ajuda": "Help",
  "nav.entrar": "Sign in",
  "nav.sair": "Sign out",
  "rodape.slogan": "Simplesmente voo — find the best dates and prices, without the hassle.",
  "rodape.ajuda": "Help and installation",
  "rodape.privacidade": "Privacy",
  "rodape.termos": "Terms",
  "idioma.rotulo": "Language",

  "consent.titulo": "Your privacy",
  "consent.texto":
    "We only use the storage the app needs to work (session, preferences and the offline cache you choose). No advertising or third-party tracking.",
  "consent.aceitar": "Got it",
  "consent.saber": "Read the privacy policy",

  "importar.titulo": "Find travel events on your phone",
  "importar.intro":
    "With your permission, we look for flights, hotels, transfers and other travel events and suggest adding them. Nothing is read until you tap the button.",
  "importar.consentimento":
    "I allow Simplesmente voo to analyse the events I choose to share, only to suggest trips and alerts.",
  "importar.escolher": "Choose a calendar file (.ics)",
  "importar.colar": "Or paste the text of an email or invitation here",
  "importar.analisar": "Find travel events",
  "importar.nenhum": "We found no travel events in this content.",
  "importar.encontrados": "Events found",
  "importar.adicionar": "Add the selected ones",
  "importar.ligarGoogle": "Connect Google account (Calendar and Gmail)",
  "importar.privacidade":
    "Events are analysed on your device and are only saved to your account if you choose to add them. You can delete everything at any time.",

  "legal.privacidade": "Privacy Policy",
  "legal.termos": "Terms and Conditions",
  "conta.apagar": "Delete my account and data",
};

const fr: Partial<Record<ChaveTexto, string>> = {
  "nav.pesquisar": "Rechercher",
  "nav.viagens": "Voyages",
  "nav.reservas": "Réservations",
  "nav.documentos": "Documents",
  "nav.avisos": "Alertes",
  "nav.importar": "Importer",
  "nav.ajuda": "Aide",
  "nav.entrar": "Se connecter",
  "nav.sair": "Se déconnecter",
  "rodape.slogan": "Simplesmente voo — trouvez les meilleures dates et prix, sans complications.",
  "rodape.ajuda": "Aide et installation",
  "rodape.privacidade": "Confidentialité",
  "rodape.termos": "Conditions",
  "idioma.rotulo": "Langue",

  "consent.titulo": "Votre vie privée",
  "consent.texto":
    "Nous utilisons uniquement le stockage nécessaire au fonctionnement de l'app (session, préférences et cache hors ligne que vous choisissez). Aucune publicité ni suivi tiers.",
  "consent.aceitar": "J'ai compris",
  "consent.saber": "Lire la politique de confidentialité",

  "importar.titulo": "Trouver les événements de voyage sur votre téléphone",
  "importar.intro":
    "Avec votre autorisation, nous cherchons vols, hôtels, transferts et autres événements de voyage et proposons de les ajouter. Rien n'est lu tant que vous n'appuyez pas sur le bouton.",
  "importar.consentimento":
    "J'autorise Simplesmente voo à analyser les événements que je choisis de partager, uniquement pour suggérer des voyages et des alertes.",
  "importar.escolher": "Choisir un fichier de calendrier (.ics)",
  "importar.colar": "Ou collez ici le texte d'un e-mail ou d'une invitation",
  "importar.analisar": "Chercher des événements de voyage",
  "importar.nenhum": "Aucun événement de voyage trouvé dans ce contenu.",
  "importar.encontrados": "Événements trouvés",
  "importar.adicionar": "Ajouter la sélection",
  "importar.ligarGoogle": "Connecter un compte Google (Agenda et Gmail)",
  "importar.privacidade":
    "Les événements sont analysés sur votre appareil et ne sont enregistrés dans votre compte que si vous choisissez de les ajouter. Vous pouvez tout supprimer à tout moment.",

  "legal.privacidade": "Politique de confidentialité",
  "legal.termos": "Conditions générales",
  "conta.apagar": "Supprimer mon compte et mes données",
};

const dicionarios: Record<Idioma, Partial<Record<ChaveTexto, string>>> = { pt, en, fr };

type Ctx = { idioma: Idioma; mudarIdioma: (i: Idioma) => void; t: (c: ChaveTexto) => string };

const IdiomaContext = createContext<Ctx>({
  idioma: "pt",
  mudarIdioma: () => {},
  t: (c) => pt[c],
});

export function IdiomaProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>("pt");

  useEffect(() => {
    const guardado = window.localStorage.getItem(CHAVE) as Idioma | null;
    if (guardado && guardado in dicionarios) {
      setIdioma(guardado);
      return;
    }
    const navegador = (navigator.language || "pt").slice(0, 2);
    if (navegador === "en" || navegador === "fr") setIdioma(navegador);
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const mudarIdioma = useCallback((i: Idioma) => {
    setIdioma(i);
    try {
      window.localStorage.setItem(CHAVE, i);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const t = useCallback((c: ChaveTexto) => dicionarios[idioma][c] ?? pt[c], [idioma]);

  const valor = useMemo(() => ({ idioma, mudarIdioma, t }), [idioma, mudarIdioma, t]);
  return <IdiomaContext.Provider value={valor}>{children}</IdiomaContext.Provider>;
}

export function useIdioma() {
  return useContext(IdiomaContext);
}
