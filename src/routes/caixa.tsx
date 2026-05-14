import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Printer, RefreshCw } from "lucide-react";
import { PinLock } from "@/components/PinLock";

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
}

const STORAGE_KEY = "pedidos";
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

const lerPedidos = (): Pedido[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Pedido[]) : [];
  } catch {
    return [];
  }
};

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
    throw new Error(
      "Não foi possível conectar à ponte de impressão.",
    );
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
  const imprimindoRef = useRef(false);

  const imprimirPedido = useCallback(
    async (pedidoPendente: Pedido, pedidosBase: Pedido[], manual = false) => {
      if (imprimindoRef.current) return;

      setPedidoParaImprimir(pedidoPendente);
      setStatusImpressao(
        manual
          ? `Tentando imprimir manualmente: ${pedidoPendente.origem}.`
          : `Enviando ${pedidoPendente.origem} para a impressora.`,
      );
      imprimindoRef.current = true;

      try {
        // 1. Tenta enviar para a ponte local via HTTP (Ideal para Produção com cabo)
        try {
          await enviarParaPonteImpressao(pedidoPendente);
        } catch (bridgeError) {
          // 2. PLANO B (Fallback): Se a ponte não estiver rodando (Fase de Testes), 
          // não trava o sistema! Usa a impressão nativa do navegador que já está com o CSS pronto.
          console.warn("Ponte local não encontrada. Utilizando impressão nativa do navegador.");

          // O setTimeout garante que o React renderize a div oculta do cupom antes de chamar a impressora
          setTimeout(() => {
            window.print();
          }, 300);
        }

        // Se chegou aqui (seja pela ponte ou pelo plano B), marca como sucesso!
        const pedidoImpresso: Pedido = {
          ...pedidoPendente,
          impresso: true,
          impressoEm: new Date().toISOString(),
        };

        const pedidosAtualizados = pedidosBase.map((pedido) =>
          pedido.id === pedidoPendente.id ? pedidoImpresso : pedido,
        );

        localStorage.setItem(STORAGE_KEY, JSON.stringify(pedidosAtualizados));
        setPedidos(pedidosAtualizados);
        setPedidoParaImprimir(pedidoImpresso);
        setPedidoComFalha(null);
        setStatusImpressao(`Cupom processado: ${pedidoImpresso.origem}.`);
      } catch (error) {
        // Erro crítico geral (ex: falha ao salvar no localStorage)
        setPedidos(pedidosBase);
        setPedidoComFalha(pedidoPendente);
        setStatusImpressao("Falha ao processar o pedido.");
      } finally {
        imprimindoRef.current = false;
      }
    },
    [],
  );

  const processarPedidos = useCallback(async () => {
    if (imprimindoRef.current) return;

    const pedidosSalvos = lerPedidos().sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    );
    const pendente = pedidosSalvos.find((pedido) => !pedido.impresso);

    if (!pendente) {
      setPedidos(pedidosSalvos);
      setPedidoComFalha(null);
      setStatusImpressao("Nenhum pedido pendente.");
      return;
    }

    await imprimirPedido(pendente, pedidosSalvos);
  }, [imprimirPedido]);

  const imprimirPedidoManual = useCallback(async () => {
    if (!pedidoComFalha) return;

    const pedidosSalvos = lerPedidos().sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    );
    const pedidoPendenteAtual =
      pedidosSalvos.find((pedido) => pedido.id === pedidoComFalha.id && !pedido.impresso) ??
      pedidoComFalha;

    await imprimirPedido(pedidoPendenteAtual, pedidosSalvos, true);
  }, [imprimirPedido, pedidoComFalha]);

  useEffect(() => {
    processarPedidos();
    window.addEventListener("storage", processarPedidos);

    return () => {
      window.removeEventListener("storage", processarPedidos);
    };
  }, [processarPedidos]);

  const pedidosRecentes = useMemo(() => pedidos.slice(0, 20), [pedidos]);
  const pendentes = pedidos.filter((pedido) => !pedido.impresso).length;

  return (
    <>
      <style>{`
        #cupom-impressao {
          display: none;
        }

        @media print {
          @page {
            size: 80mm auto;
            margin: 4mm;
          }

          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }

          .caixa-layout {
            display: none !important;
          }

          #cupom-impressao {
            display: block !important;
            width: 72mm;
            margin: 0 auto;
            color: #000;
            font-family: "Courier New", ui-monospace, monospace;
            font-size: 10pt;
            line-height: 1.35;
            padding-bottom: 18mm;
          }

          #cupom-impressao .linha {
            display: flex;
            justify-content: space-between;
            gap: 8px;
          }

          #cupom-impressao .centro {
            text-align: center;
          }

          #cupom-impressao .forte {
            font-weight: 800;
          }

          #cupom-impressao .divisor {
            margin: 5px 0;
            text-align: center;
            white-space: pre;
          }
        }
      `}</style>

      <main className="caixa-layout min-h-screen bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
                Impressão automática
              </p>
              <h1 className="text-2xl font-black text-primary">Caixa Ativo</h1>
            </div>
            <div className="flex gap-2">
              <Link
                to="/garcom"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground transition hover:border-primary hover:text-primary"
              >
                Garçom
              </Link>
              <button
                type="button"
                onClick={processarPedidos}
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-black text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
              >
                <RefreshCw size={16} aria-hidden="true" />
                Atualizar
              </button>
            </div>
          </div>
        </header>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-6 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase text-muted-foreground">Pedidos</p>
                <strong className="text-3xl font-black text-foreground">{pedidos.length}</strong>
              </div>
              <Clock className="text-primary" size={30} aria-hidden="true" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase text-muted-foreground">Pendentes</p>
                <strong className="text-3xl font-black text-foreground">{pendentes}</strong>
              </div>
              <Printer className="text-primary" size={30} aria-hidden="true" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase text-muted-foreground">Ponte local</p>
                <strong className="text-xl font-black text-foreground">
                  {statusImpressao}
                </strong>
                {pedidoComFalha && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={imprimirPedidoManual}
                      className="rounded-lg bg-primary px-3 py-2 text-sm font-black uppercase text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                    >
                      Imprimir manualmente
                    </button>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      Este botão aparece apenas quando a impressão automática falha.
                    </p>
                  </div>
                )}
              </div>
              <CheckCircle2 className="text-primary" size={30} aria-hidden="true" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-8">
          <div className="rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-lg font-black text-foreground">Pedidos recentes</h2>
            </div>

            {pedidosRecentes.length === 0 ? (
              <div className="grid min-h-48 place-items-center px-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground">
                  Nenhum pedido recebido ainda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pedidosRecentes.map((pedido) => (
                  <article
                    key={pedido.id}
                    className="grid gap-3 px-4 py-4 md:grid-cols-[1.2fr_1fr_auto]"
                  >
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-secondary px-2 py-1 text-xs font-black uppercase text-secondary-foreground">
                          {pedido.origem}
                        </span>
                        <span
                          className={`rounded-lg px-2 py-1 text-xs font-black uppercase ${pedido.impresso
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-800"
                            }`}
                        >
                          {pedido.impresso ? "Impresso" : "Pendente"}
                        </span>
                      </div>
                      <h3 className="font-black text-foreground">
                        {pedido.cliente?.nome ?? pedido.garcom ?? "Pedido de mesa"}
                      </h3>
                      <p className="text-sm font-semibold text-muted-foreground">
                        {formatDateTime(pedido.data)}
                      </p>
                    </div>

                    <div className="text-sm font-semibold text-muted-foreground">
                      <p>{pedido.itens.length} item(ns)</p>
                      <p>Pagamento: {pedido.pagamento}</p>
                      {pedido.cliente?.endereco && <p>Endereço: {pedido.cliente.endereco}</p>}
                    </div>

                    <div className="text-left md:text-right">
                      <p className="text-xs font-black uppercase text-muted-foreground">Total</p>
                      <p className="text-2xl font-black text-primary">
                        {formatCurrency(pedido.total)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

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
