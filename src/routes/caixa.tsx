// src/routes/caixa.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  Printer,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Volume2,
  VolumeX,
  Store,
  Edit3,
  Trash2,
  X,
  Plus,
  Minus,
  BarChart3,
  Filter,
  Ban,
  ShoppingBag,
  AlertTriangle
} from "lucide-react";
import { PinLock } from "@/components/PinLock";
import somCampainha from "@/assets/campainha.mp3";
import { collection, onSnapshot, query, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const Route = createFileRoute("/caixa")({
  component: CaixaRoute,
  head: () => ({
    meta: [{ title: "Caixa Ativo - Pizzaria 2 Irmãos" }],
  }),
});

interface ItemPedido {
  key: string;
  id: number;
  nome: string;
  precoUnitario: number;
  quantidade: number;
  tamanho?: string;
  categoria?: string;
  meia?: {
    saborA: string;
    saborB: string;
  };
}

export interface Pedido {
  id: string;
  data: string;
  origem: string;
  pagamento: string;
  itens: ItemPedido[];
  subtotal: number;
  taxaEntrega?: number;
  total: number;
  impresso: boolean;
  impressoEm?: string;
  observacoes?: string;
  mesa?: string;
  garcom?: string;
  cliente?: {
    nome: string;
    endereco?: string;
  };
  tipoEntrega?: string;
  status?: string;
}

const PRINT_BRIDGE_URL = "http://127.0.0.1:3333/print";
const PRINTER_NAME_KEY = "caixa-printer-name";
const CUPOM_WIDTH = 32;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const centerText = (text: string) => {
  if (text.length >= CUPOM_WIDTH) return text;
  const left = Math.floor((CUPOM_WIDTH - text.length) / 2);
  return `${" ".repeat(left)}${text}`;
};

const formatDivider = (char = "-") => char.repeat(CUPOM_WIDTH);

const wrapText = (text: string, width = CUPOM_WIDTH) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
};

const formatLine = (left: string, right: string) => {
  const available = CUPOM_WIDTH - right.length;
  const safeLeft = left.length > available ? left.slice(0, Math.max(0, available - 1)) : left;
  return `${safeLeft}${" ".repeat(Math.max(1, CUPOM_WIDTH - safeLeft.length - right.length))}${right}`;
};

const formatarCupomTexto = (pedido: Pedido) => {
  const lines: string[] = [
    centerText("PIZZARIA 2 IRMAOS"),
    centerText("Tel: (84) 99813-5262"),
    formatDivider("="),
    formatLine("Pedido:", `#${pedido.id.slice(0, 8).toUpperCase()}`),
    formatLine("Data:", formatDateTime(pedido.data)),
    formatLine("Origem:", pedido.origem),
  ];

  if (pedido.garcom) lines.push(formatLine("Garcom:", pedido.garcom));
  if (pedido.cliente?.nome) lines.push(formatLine("Cliente:", pedido.cliente.nome));
  if (pedido.cliente?.endereco) {
    lines.push("Endereco:");
    lines.push(...wrapText(pedido.cliente.endereco));
  }

  lines.push(formatDivider("-"), "ITENS");

  pedido.itens.forEach((item) => {
    const nome = `${item.quantidade}x ${item.nome}${item.tamanho ? ` (${item.tamanho})` : ""}`;
    const totalItem = formatCurrency(item.precoUnitario * item.quantidade);
    const nomeLines = wrapText(nome, 21);

    lines.push(formatLine(nomeLines[0] ?? nome, totalItem));
    nomeLines.slice(1).forEach((line) => lines.push(`  ${line}`));
    lines.push(`  un: ${formatCurrency(item.precoUnitario)}`);
  });

  if (pedido.observacoes) {
    lines.push(formatDivider("-"), "OBSERVACOES", ...wrapText(pedido.observacoes));
  }

  lines.push(
    formatDivider("-"),
    formatLine("Subtotal:", formatCurrency(pedido.subtotal)),
  );

  if (pedido.taxaEntrega) {
    lines.push(formatLine("Entrega:", formatCurrency(pedido.taxaEntrega)));
  }

  lines.push(
    formatLine("TOTAL:", formatCurrency(pedido.total)),
    formatDivider("="),
    `Pagamento: ${pedido.pagamento}`,
    centerText("Obrigado pela preferencia!"),
    "",
    "",
    "",
  );

  return lines.join("\r\n");
};

const enviarParaPonteImpressao = async (pedido: Pedido) => {
  const printerName = localStorage.getItem(PRINTER_NAME_KEY)?.trim() ?? "";
  let response: Response;

  try {
    response = await fetch(PRINT_BRIDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        printerName,
        text: formatarCupomTexto(pedido),
      }),
    });
  } catch {
    throw new Error("Não foi possível conectar à ponte de impressão.");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Falha ao enviar para a ponte de impressão.");
  }
};

function CaixaRoute() {
  return (
    <PinLock correctPin="1234" title="Caixa Ativo">
      <CaixaPage />
    </PinLock>
  );
}

function CaixaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoParaImprimir, setPedidoParaImprimir] = useState<Pedido | null>(null);
  const [statusImpressao, setStatusImpressao] = useState("Aguardando pedidos.");
  const [pedidoComFalha, setPedidoComFalha] = useState<Pedido | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const imprimindoRef = useRef(false);

  const [lojaAberta, setLojaAberta] = useState(true);

  // ESTADOS DOS MODAIS
  const [draftPedidoEdicao, setDraftPedidoEdicao] = useState<Pedido | null>(null);
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState<string | null>(null);

  // ESTADOS DO FILTRO DINÂMICO
  const [filtroTempo, setFiltroTempo] = useState<'hoje' | 'semana' | 'mes' | 'todos'>('hoje');
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  // FILA DE IMPRESSÃO (Sempre em tempo real, ignora o filtro de data)
  const pendentes = pedidos.filter((pedido) => !pedido.impresso && pedido.status !== 'cancelado').length;
  const pendentesAnteriorRef = useRef(pendentes);

  useEffect(() => {
    if (somAtivo && pendentes > pendentesAnteriorRef.current) {
      const audio = new Audio(somCampainha);
      audio.play().catch(() => console.warn("Navegador bloqueou o áudio automático."));
    }
    pendentesAnteriorRef.current = pendentes;
  }, [pendentes, somAtivo]);

  // LÓGICA MESTRE: Calcula as datas exatas
  const periodos = useMemo(() => {
    const hojeData = new Date();
    hojeData.setHours(0, 0, 0, 0);

    const inicioSemana = new Date(hojeData);
    inicioSemana.setDate(hojeData.getDate() - hojeData.getDay()); // Inicia no Domingo

    const inicioMes = new Date(hojeData.getFullYear(), hojeData.getMonth(), 1);

    return { hojeData, inicioSemana, inicioMes };
  }, []);

  // DASHBOARD DINÂMICO (Responde ao clique do filtro)
  const statsPeriodo = useMemo(() => {
    let faturamento = 0;
    let qtdPedidos = 0;

    pedidos.forEach(pedido => {
      // O Dashboard Financeiro só conta pedidos válidos
      if (pedido.status === 'cancelado') return;

      const dataPedido = new Date(pedido.data);
      let incluir = false;

      if (filtroTempo === 'todos') incluir = true;
      else if (filtroTempo === 'hoje' && dataPedido >= periodos.hojeData) incluir = true;
      else if (filtroTempo === 'semana' && dataPedido >= periodos.inicioSemana) incluir = true;
      else if (filtroTempo === 'mes' && dataPedido >= periodos.inicioMes) incluir = true;

      if (incluir) {
        faturamento += pedido.total;
        qtdPedidos++;
      }
    });

    const ticketMedio = qtdPedidos > 0 ? faturamento / qtdPedidos : 0;
    return { faturamento, qtdPedidos, ticketMedio };
  }, [pedidos, filtroTempo, periodos]);

  // LISTA DE PEDIDOS FILTRADA
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(pedido => {
      // 1. Filtro de Cancelados
      if (mostrarCancelados) {
        if (pedido.status !== 'cancelado') return false;
      } else {
        if (pedido.status === 'cancelado') return false;
      }

      // 2. Filtro de Tempo
      if (filtroTempo === 'todos') return true;

      const dataPedido = new Date(pedido.data);
      if (filtroTempo === 'hoje' && dataPedido >= periodos.hojeData) return true;
      if (filtroTempo === 'semana' && dataPedido >= periodos.inicioSemana) return true;
      if (filtroTempo === 'mes' && dataPedido >= periodos.inicioMes) return true;

      return false;
    });
  }, [pedidos, filtroTempo, mostrarCancelados, periodos]);

  // Títulos Dinâmicos para os Cards
  const tituloDashboard = useMemo(() => {
    if (filtroTempo === 'hoje') return "de Hoje";
    if (filtroTempo === 'semana') return "desta Semana";
    if (filtroTempo === 'mes') return "deste Mês";
    return "Total (Geral)";
  }, [filtroTempo]);

  const imprimirPedido = useCallback(
    async (pedidoPendente: Pedido, manual = false) => {
      if (imprimindoRef.current) return;

      setPedidoParaImprimir(pedidoPendente);
      setStatusImpressao(
        manual
          ? `Tentando imprimir manualmente: ${pedidoPendente.origem}.`
          : `Enviando ${pedidoPendente.origem} para a impressora.`,
      );
      imprimindoRef.current = true;

      try {
        try {
          await enviarParaPonteImpressao(pedidoPendente);
        } catch (bridgeError) {
          console.warn("Ponte local não encontrada. Utilizando impressão nativa do navegador.");
          setTimeout(() => {
            window.print();
          }, 300);
        }

        try {
          await updateDoc(doc(db, "pedidos", pedidoPendente.id), {
            impresso: true,
            impressoEm: new Date().toISOString(),
          });
          setPedidoComFalha(null);
          setStatusImpressao(`Cupom processado: ${pedidoPendente.origem}.`);
        } catch (errorDb) {
          console.error("Erro ao salvar status de impressao:", errorDb);
          setPedidoComFalha(pedidoPendente);
          setStatusImpressao("Falha ao salvar status no banco de dados.");
        }

      } catch (error) {
        setPedidoComFalha(pedidoPendente);
        setStatusImpressao("Falha ao processar o pedido.");
      } finally {
        imprimindoRef.current = false;
      }
    },
    [],
  );

  const processarPedidos = useCallback(async (listaPedidos: Pedido[]) => {
    if (imprimindoRef.current) return;
    const pendente = listaPedidos.find((pedido) => !pedido.impresso && pedido.status !== 'cancelado');

    if (!pendente) {
      setPedidoComFalha(null);
      setStatusImpressao("Nenhum pedido pendente.");
      return;
    }

    await imprimirPedido(pendente);
  }, [imprimirPedido]);

  const imprimirPedidoManual = useCallback(async () => {
    if (!pedidoComFalha) return;
    await imprimirPedido(pedidoComFalha, true);
  }, [imprimirPedido, pedidoComFalha]);

  useEffect(() => {
    const q = query(collection(db, "pedidos"));

    const unsubscribePedidos = onSnapshot(q, (snapshot) => {
      const pedidosFirebase: Pedido[] = [];
      snapshot.forEach((doc) => {
        pedidosFirebase.push(doc.data() as Pedido);
      });

      const pedidosOrdenados = pedidosFirebase.sort(
        (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
      );

      setPedidos(pedidosOrdenados);
      processarPedidos(pedidosOrdenados);
    });

    const unsubscribeLoja = onSnapshot(doc(db, "configuracoes", "loja"), (docSnap) => {
      if (docSnap.exists()) {
        setLojaAberta(docSnap.data().aberta);
      }
    });

    return () => {
      unsubscribePedidos();
      unsubscribeLoja();
    };
  }, [processarPedidos]);

  const handleToggleLoja = async () => {
    const novoStatus = !lojaAberta;
    setLojaAberta(novoStatus);
    try {
      await setDoc(doc(db, "configuracoes", "loja"), { aberta: novoStatus }, { merge: true });
    } catch (err) {
      alert("Erro de permissão no Firebase. Verifique as Regras do Firestore.");
      setLojaAberta(!novoStatus);
    }
  };

  // NOVA LÓGICA DE CANCELAMENTO COM MODAL BONITO
  const abrirModalCancelamento = (id: string) => {
    setPedidoParaCancelar(id);
  };

  const confirmarCancelamento = async () => {
    if (!pedidoParaCancelar) return;
    try {
      await updateDoc(doc(db, "pedidos", pedidoParaCancelar), { status: "cancelado" });
      setPedidoParaCancelar(null); // Fecha o modal
    } catch (err) {
      console.error("Erro ao cancelar:", err);
      alert("Erro de permissão no Firebase ao cancelar pedido.");
    }
  };

  const abrirModalEdicao = (pedido: Pedido) => {
    setDraftPedidoEdicao(JSON.parse(JSON.stringify(pedido)));
  };

  const alterarQtdItemDraft = (key: string, delta: number) => {
    setDraftPedidoEdicao((prev) => {
      if (!prev) return prev;
      const novosItens = prev.itens
        .map((item) => (item.key === key ? { ...item, quantidade: item.quantidade + delta } : item))
        .filter((item) => item.quantidade > 0);

      const novoSubtotal = novosItens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0);
      const novoTotal = novoSubtotal + (prev.taxaEntrega || 0);

      return { ...prev, itens: novosItens, subtotal: novoSubtotal, total: novoTotal };
    });
  };

  const removerItemDraft = (key: string) => {
    setDraftPedidoEdicao((prev) => {
      if (!prev) return prev;
      const novosItens = prev.itens.filter((item) => item.key !== key);
      const novoSubtotal = novosItens.reduce((acc, item) => acc + item.precoUnitario * item.quantidade, 0);
      const novoTotal = novoSubtotal + (prev.taxaEntrega || 0);
      return { ...prev, itens: novosItens, subtotal: novoSubtotal, total: novoTotal };
    });
  };

  const handleSalvarEdicaoItens = async () => {
    if (!draftPedidoEdicao) return;
    try {
      await updateDoc(doc(db, "pedidos", draftPedidoEdicao.id), {
        itens: draftPedidoEdicao.itens,
        subtotal: draftPedidoEdicao.subtotal,
        total: draftPedidoEdicao.total
      });
      setDraftPedidoEdicao(null);
    } catch (err) {
      alert("Erro ao atualizar o pedido no banco de dados.");
    }
  };

  return (
    <>
      <style>{`
        #cupom-impressao { display: none; }
        @media print {
          @page { size: 58mm auto; margin: 2mm; }
          html, body { background: #fff !important; color: #000 !important; }
          .caixa-layout { display: none !important; }
          #cupom-impressao {
            display: block !important;
            width: 48mm;
            margin: 0 auto;
            color: #000;
            font-family: "Courier New", ui-monospace, monospace;
            font-size: 8pt;
            line-height: 1.2;
            padding-bottom: 18mm;
          }
          #cupom-impressao .linha { display: flex; justify-content: space-between; gap: 8px; }
          #cupom-impressao .centro { text-align: center; }
          #cupom-impressao .forte { font-weight: 800; }
          #cupom-impressao .divisor { margin: 5px 0; text-align: center; white-space: pre; }
        }
      `}</style>

      <main className="caixa-layout min-h-screen bg-background pb-10">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Painel Gerencial
              </p>
              <h1 className="text-2xl font-black text-primary">Caixa Inteligente</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleLoja}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition ${lojaAberta
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-red-500 text-white hover:bg-red-600 shadow-md"
                  }`}
              >
                <Store size={16} />
                {lojaAberta ? "Loja Aberta" : "Loja Fechada"}
              </button>

              <button
                type="button"
                onClick={() => setSomAtivo(!somAtivo)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${somAtivo
                  ? "border-green-500 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
              >
                {somAtivo ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {somAtivo ? "Som Ativado" : "Ativar Som"}
              </button>
              <Link
                to="/garcom"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground transition hover:border-primary hover:text-primary"
              >
                Garçom
              </Link>
            </div>
          </div>
        </header>

        {/* --- CONTROLE GLOBAL DE FILTROS --- */}
        <section className="mx-auto max-w-7xl px-4 pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-black uppercase text-foreground">
              <Filter size={18} className="text-primary" /> Período de Análise:
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="flex w-full sm:w-auto rounded-lg border border-border bg-card p-1 shadow-sm">
                {(['hoje', 'semana', 'mes', 'todos'] as const).map((periodo) => (
                  <button
                    key={periodo}
                    onClick={() => setFiltroTempo(periodo)}
                    className={`flex-1 sm:flex-none px-4 py-2 text-xs font-black uppercase rounded-md transition-colors ${filtroTempo === periodo
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted/80'
                      }`}
                  >
                    {periodo}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setMostrarCancelados(!mostrarCancelados)}
                className={`flex flex-1 sm:flex-none justify-center items-center gap-2 px-4 py-2 text-xs font-black uppercase rounded-lg border transition-colors shadow-sm ${mostrarCancelados
                    ? 'border-red-500 bg-red-600 text-white'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
              >
                <Ban size={14} />
                {mostrarCancelados ? 'Sair de Cancelados' : 'Ver Cancelados'}
              </button>
            </div>
          </div>
        </section>

        {/* --- DASHBOARD FINANCEIRO DINÂMICO --- */}
        {!mostrarCancelados && (
          <section className="mx-auto max-w-7xl px-4 pt-6 transition-all">
            <h2 className="mb-3 text-sm font-black uppercase text-muted-foreground flex items-center gap-2">
              <BarChart3 size={16} /> Resumo Financeiro ({tituloDashboard})
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Faturamento {tituloDashboard}</p>
                    <strong className="text-3xl font-black text-green-500">{formatCurrency(statsPeriodo.faturamento)}</strong>
                  </div>
                  <div className="bg-green-500/10 p-2 rounded-lg"><DollarSign className="text-green-500" size={28} /></div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Pedidos {tituloDashboard}</p>
                    <strong className="text-3xl font-black text-blue-500">{statsPeriodo.qtdPedidos}</strong>
                  </div>
                  <div className="bg-blue-500/10 p-2 rounded-lg"><ShoppingBag className="text-blue-500" size={28} /></div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:border-primary/50">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Ticket Médio {tituloDashboard}</p>
                    <strong className="text-3xl font-black text-orange-500">{formatCurrency(statsPeriodo.ticketMedio)}</strong>
                  </div>
                  <div className="bg-orange-500/10 p-2 rounded-lg"><TrendingUp className="text-orange-500" size={28} /></div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* --- VISÃO OPERACIONAL EM TEMPO REAL --- */}
        <section className="mx-auto max-w-7xl px-4 py-6">
          <h2 className="mb-3 text-sm font-black uppercase text-muted-foreground flex items-center gap-2">
            <Clock size={16} /> Central de Operação (Agora)
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className={`flex items-center justify-between gap-4 rounded-xl border p-5 shadow-[var(--shadow-card)] transition-colors ${pendentes > 0 ? 'border-red-300 bg-red-50' : 'border-border bg-card'}`}>
              <div className="flex items-center gap-4">
                <div className={`${pendentes > 0 ? 'bg-red-200' : 'bg-muted'} p-3 rounded-full`}>
                  <Printer className={pendentes > 0 ? 'text-red-700 animate-pulse' : 'text-muted-foreground'} size={24} />
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase ${pendentes > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Fila de Impressão</p>
                  <strong className={`text-xl font-black ${pendentes > 0 ? 'text-red-700' : 'text-foreground'}`}>
                    {pendentes} {pendentes === 1 ? 'pedido aguardando' : 'pedidos aguardando'}
                  </strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => processarPedidos(pedidos)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-sm transition hover:bg-[var(--brand-red-dark)]"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Ponte de Impressão (Local)</p>
                <strong className="text-sm font-black text-foreground line-clamp-2 mt-1">
                  {statusImpressao}
                </strong>
              </div>
              {pedidoComFalha ? (
                <button
                  type="button"
                  onClick={imprimirPedidoManual}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-black uppercase text-white shadow-sm transition hover:bg-red-700"
                >
                  Tentar Novamente
                </button>
              ) : (
                <CheckCircle2 className="text-green-500 shrink-0" size={32} aria-hidden="true" />
              )}
            </div>
          </div>
        </section>

        {/* --- LISTAGEM DE PEDIDOS --- */}
        <section className="mx-auto max-w-7xl px-4 pb-8">
          <div className={`rounded-xl border shadow-[var(--shadow-card)] overflow-hidden ${mostrarCancelados ? 'border-red-300' : 'border-border bg-card'}`}>
            <div className={`border-b px-5 py-4 ${mostrarCancelados ? 'bg-red-50 border-red-200' : 'bg-muted/30 border-border'}`}>
              <h2 className={`text-lg font-black flex items-center gap-2 ${mostrarCancelados ? 'text-red-700' : 'text-foreground'}`}>
                {mostrarCancelados ? <Ban size={20} /> : null}
                Lista de Pedidos ({tituloDashboard}) {mostrarCancelados && " - SOMENTE CANCELADOS"}
              </h2>
            </div>

            {pedidosFiltrados.length === 0 ? (
              <div className={`grid min-h-48 place-items-center px-4 text-center ${mostrarCancelados ? 'bg-white' : ''}`}>
                <p className="text-sm font-semibold text-muted-foreground">
                  Nenhum pedido encontrado nesta aba.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border bg-card">
                {pedidosFiltrados.map((pedido) => (
                  <article
                    key={pedido.id}
                    className={`grid gap-4 px-5 py-5 md:grid-cols-[1.2fr_1fr_auto] transition hover:bg-muted/10 ${pedido.status === 'cancelado' ? 'opacity-70 bg-red-50/20 hover:bg-red-50/40' : ''}`}
                  >
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-secondary px-2 py-1 text-[10px] font-black uppercase tracking-wider text-secondary-foreground">
                          {pedido.origem}
                        </span>
                        {pedido.status === 'cancelado' ? (
                          <span className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white">
                            Cancelado
                          </span>
                        ) : (
                          <span
                            className={`rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wider ${pedido.impresso
                              ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700 animate-pulse ring-1 ring-orange-300"
                              }`}
                          >
                            {pedido.impresso ? "Impresso" : "Aguardando Caixa"}
                          </span>
                        )}
                      </div>
                      <h3 className={`font-black text-lg text-foreground ${pedido.status === 'cancelado' ? 'line-through text-muted-foreground' : ''}`}>
                        {pedido.cliente?.nome ?? pedido.garcom ?? "Pedido de mesa"}
                      </h3>
                      <p className="text-xs font-semibold text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock size={12} /> {formatDateTime(pedido.data)}
                      </p>
                    </div>

                    <div className="text-sm font-medium text-muted-foreground space-y-1">
                      <p className="font-bold text-foreground">{pedido.itens.length} item(ns) na sacola</p>
                      <p className="flex items-center gap-1"><DollarSign size={14} /> Pagamento: {pedido.pagamento}</p>
                      {pedido.cliente?.endereco && <p className="text-xs bg-muted/50 p-2 rounded mt-2 border border-border/50">{pedido.cliente.endereco}</p>}
                    </div>

                    <div className="flex flex-col items-start md:items-end justify-between">
                      <div className="text-left md:text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Valor Total</p>
                        <p className={`text-2xl font-black ${pedido.status === 'cancelado' ? 'text-muted-foreground line-through' : 'text-primary'}`}>
                          {formatCurrency(pedido.total)}
                        </p>
                      </div>

                      {/* BOTÕES DE AÇÃO DO PEDIDO (Ocultos se estiver cancelado) */}
                      {pedido.status !== 'cancelado' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => imprimirPedido(pedido, true)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:bg-zinc-100 hover:text-zinc-900"
                            title="Reimprimir Pedido Atualizado"
                          >
                            <Printer size={16} />
                          </button>

                          <button
                            onClick={() => abrirModalEdicao(pedido)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-600 shadow-sm transition hover:bg-blue-100 hover:border-blue-300"
                            title="Editar Itens do Pedido"
                          >
                            <Edit3 size={16} />
                          </button>

                          <button
                            onClick={() => abrirModalCancelamento(pedido.id)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 shadow-sm transition hover:bg-red-100 hover:border-red-300"
                            title="Cancelar Pedido"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* MODAL AVANÇADO DE EDIÇÃO DE ITENS */}
      {draftPedidoEdicao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-card p-6 shadow-2xl border border-border">
            <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-xl font-black text-foreground">Editar Pedido</h2>
                <p className="text-xs font-bold text-muted-foreground mt-1 uppercase">
                  Cliente: <span className="text-primary">{draftPedidoEdicao.cliente?.nome || draftPedidoEdicao.garcom}</span>
                </p>
              </div>
              <button onClick={() => setDraftPedidoEdicao(null)} className="rounded-full p-2 bg-muted text-muted-foreground hover:bg-red-100 hover:text-red-600 transition">
                <X size={20} />
              </button>
            </div>

            <ul className="space-y-3 mb-6">
              {draftPedidoEdicao.itens.map((item) => (
                <li key={item.key} className="rounded-xl border border-border bg-background p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3 border-b border-border/50 pb-2">
                    <div>
                      <p className="text-sm font-black text-foreground leading-tight">
                        {item.nome} {item.tamanho && <span className="text-primary">({item.tamanho})</span>}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground mt-1">
                        {formatCurrency(item.precoUnitario)} a unidade
                      </p>
                    </div>
                    <button
                      onClick={() => removerItemDraft(item.key)}
                      className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition"
                      title="Remover Item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                      <button
                        onClick={() => alterarQtdItemDraft(item.key, -1)}
                        className="grid h-7 w-7 place-items-center rounded bg-background font-black text-foreground shadow-sm transition hover:text-red-500"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-sm font-black">{item.quantidade}</span>
                      <button
                        onClick={() => alterarQtdItemDraft(item.key, 1)}
                        className="grid h-7 w-7 place-items-center rounded bg-background font-black text-foreground shadow-sm transition hover:text-primary"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong className="text-sm font-black text-primary bg-primary/10 px-2 py-1 rounded">
                      {formatCurrency(item.precoUnitario * item.quantidade)}
                    </strong>
                  </div>
                </li>
              ))}
              {draftPedidoEdicao.itens.length === 0 && (
                <div className="text-center py-6 bg-red-50 rounded-xl border border-red-100">
                  <p className="text-sm text-red-600 font-bold">O carrinho está vazio.</p>
                  <p className="text-xs text-red-400 mt-1">Cancele o pedido se o cliente desistiu de tudo.</p>
                </div>
              )}
            </ul>

            <div className="space-y-2 rounded-xl bg-muted/30 p-4 mb-5 border border-border">
              <div className="flex justify-between text-sm font-bold text-muted-foreground">
                <span>Subtotal dos Produtos</span>
                <span>{formatCurrency(draftPedidoEdicao.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-muted-foreground">
                <span>Taxa de Entrega</span>
                <span>{formatCurrency(draftPedidoEdicao.taxaEntrega || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 mt-1 text-xl font-black text-foreground">
                <span>Total Final</span>
                <span className="text-primary">{formatCurrency(draftPedidoEdicao.total)}</span>
              </div>
            </div>

            <button
              onClick={handleSalvarEdicaoItens}
              disabled={draftPedidoEdicao.itens.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-black uppercase tracking-wider text-primary-foreground shadow-[var(--shadow-warm)] transition hover:bg-[var(--brand-red-dark)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={18} /> Salvar Edição
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO (NOVO) */}
      {pedidoParaCancelar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl bg-card p-6 text-center shadow-2xl duration-200 border border-border">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle size={36} strokeWidth={2.5} />
            </div>

            <h2 className="mb-2 text-2xl font-black text-foreground">Cancelar Pedido?</h2>
            <p className="mb-6 font-semibold text-muted-foreground leading-relaxed">
              Tem certeza que deseja cancelar este pedido? Ele será movido para a aba de Cancelados e <strong className="text-foreground">não entrará no faturamento.</strong>
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setPedidoParaCancelar(null)}
                className="flex-1 rounded-xl border border-border bg-background py-3 text-sm font-bold text-foreground transition hover:bg-muted active:scale-95"
              >
                Não, Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white shadow-md transition hover:bg-red-700 active:scale-95"
              >
                Sim, Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CÓDIGO DA IMPRESSÃO FICA AQUI EMBAIXO INVISÍVEL */}
      <div id="cupom-impressao" aria-hidden={!pedidoParaImprimir}>
        {pedidoParaImprimir && (
          <>
            <div className="centro forte" style={{ fontSize: "14pt" }}>
              PIZZARIA 2 IRMÃOS
            </div>
            <div className="centro">Tel: (84) 99813-5262</div>
            <div className="divisor">================================</div>
            <div className="linha">
              <span>Pedido:</span>
              <span className="forte">#{pedidoParaImprimir.id.slice(0, 8).toUpperCase()}</span>
            </div>
            <div className="linha">
              <span>Data:</span>
              <span>{formatDateTime(pedidoParaImprimir.data)}</span>
            </div>
            <div className="linha">
              <span>Origem:</span>
              <span className="forte">{pedidoParaImprimir.origem}</span>
            </div>
            {pedidoParaImprimir.garcom && (
              <div className="linha">
                <span>Garçom:</span>
                <span>{pedidoParaImprimir.garcom}</span>
              </div>
            )}
            {pedidoParaImprimir.cliente?.nome && (
              <div className="linha">
                <span>Cliente:</span>
                <span>{pedidoParaImprimir.cliente.nome}</span>
              </div>
            )}
            {pedidoParaImprimir.cliente?.endereco && (
              <div>
                <span className="forte">Endereço:</span>
                <div>{pedidoParaImprimir.cliente.endereco}</div>
              </div>
            )}
            <div className="divisor">--------------------------------</div>
            <div className="forte">ITENS</div>
            {pedidoParaImprimir.itens.map((item) => (
              <div key={item.key} style={{ margin: "4px 0" }}>
                <div className="linha">
                  <span>
                    {item.quantidade}x {item.nome}
                    {item.tamanho ? ` (${item.tamanho})` : ""}
                  </span>
                  <span>{formatCurrency(item.precoUnitario * item.quantidade)}</span>
                </div>
                <div style={{ color: "#555", fontSize: "9pt" }}>
                  un: {formatCurrency(item.precoUnitario)}
                </div>
              </div>
            ))}
            {pedidoParaImprimir.observacoes && (
              <>
                <div className="divisor">--------------------------------</div>
                <div className="forte">OBSERVAÇÕES</div>
                <div>{pedidoParaImprimir.observacoes}</div>
              </>
            )}
            <div className="divisor">--------------------------------</div>
            <div className="linha">
              <span>Subtotal:</span>
              <span>{formatCurrency(pedidoParaImprimir.subtotal)}</span>
            </div>
            {!!pedidoParaImprimir.taxaEntrega && (
              <div className="linha">
                <span>Entrega:</span>
                <span>{formatCurrency(pedidoParaImprimir.taxaEntrega)}</span>
              </div>
            )}
            <div className="linha forte" style={{ fontSize: "13pt" }}>
              <span>TOTAL:</span>
              <span>{formatCurrency(pedidoParaImprimir.total)}</span>
            </div>
            <div className="divisor">================================</div>
            <div className="centro">Pagamento: {pedidoParaImprimir.pagamento}</div>
            <div className="centro">Obrigado pela preferência!</div>
          </>
        )}
      </div>
    </>
  );
}