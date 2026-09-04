/** Cache offline opcional, guardada apenas neste dispositivo e separada por conta.
 * Guardamos texto (fichas, datas, referências), nunca os ficheiros originais. */

const PREFIXO = "sv:offline:";
const CHAVE_DONO = "sv:offline:dono";

export type ConteudoOffline = {
  atualizadoEm: string;
  viagem: { titulo: string; periodo: string } | null;
  documentos: Array<{
    id: string;
    nome: string;
    tipoDocumento: string;
    quando: string;
    local: string;
    referencia: string;
  }>;
};

export type EstadoOffline = {
  consentimento: boolean;
  selecionados: string[];
  conteudo: ConteudoOffline | null;
};

const VAZIO: EstadoOffline = { consentimento: false, selecionados: [], conteudo: null };

function disponivel() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function chave(dono: string) {
  return `${PREFIXO}${dono || "convidado"}`;
}

/** Identidade do dono da cache: id da conta ou "convidado". */
export function donoAtual(userId?: string | null) {
  return userId ?? "convidado";
}

export function lerOffline(dono: string): EstadoOffline {
  if (!disponivel()) return VAZIO;
  try {
    const bruto = localStorage.getItem(chave(dono));
    if (!bruto) return VAZIO;
    const dados = JSON.parse(bruto) as EstadoOffline;
    return { ...VAZIO, ...dados };
  } catch {
    return VAZIO;
  }
}

export function guardarOffline(dono: string, estado: EstadoOffline) {
  if (!disponivel()) return;
  try {
    localStorage.setItem(chave(dono), JSON.stringify(estado));
    localStorage.setItem(CHAVE_DONO, dono);
  } catch {
    // Espaço esgotado ou modo privado: seguimos sem cache.
  }
}

export function limparOffline(dono: string) {
  if (!disponivel()) return;
  localStorage.removeItem(chave(dono));
}

/** Apaga tudo o que pertence a outras contas — chamado sempre que a sessão muda,
 * para nunca mostrar documentos de um utilizador a outro. */
export function limparCacheDeOutrasContas(donoAtivo: string) {
  if (!disponivel()) return;
  const aRemover: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIXO) && k !== chave(donoAtivo) && k !== CHAVE_DONO) aRemover.push(k);
  }
  aRemover.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(CHAVE_DONO, donoAtivo);
}

export function tamanhoAproximado(dono: string) {
  if (!disponivel()) return 0;
  return (localStorage.getItem(chave(dono)) ?? "").length;
}
