import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  UserRound,
} from "lucide-react";
import { PinLock } from "@/components/PinLock";
import { bebidas, pasteis, pizzas, porcoes, sucos, type PizzaSize } from "@/data/menu";

export const Route = createFileRoute("/garcom")({
  component: GarcomRoute,
  head: () => ({
    meta: [{ title: "Garçom - Pizzaria 2 Irmãos" }],
  }),
});

type CategoriaCarrinho = "pizza" | "pastel" | "porcao" | "bebida" | "suco";
type PagamentoMesa = "A DEFINIR NO CAIXA";

export interface ItemCarrinhoGarcom {
  key: string;
  id: number;
  nome: string;
  categoria: CategoriaCarrinho;
  precoUnitario: number;
  quantidade: number;
  tamanho?: PizzaSize;
  meia?: {
    saborA: string;
    saborB: string;
  };
}

export interface EstadoPedidoGarcom {
  nomeGarcom: string;
  numeroMesa: string;
  observacoes: string;
  carrinho: ItemCarrinhoGarcom[];
}

interface PedidoMesa {
  id: string;
  data: string;
  origem: string;
  garcom: string;
  mesa: string;
  pagamento: PagamentoMesa;
  itens: ItemCarrinhoGarcom[];
  subtotal: number;
  taxaEntrega: number;
  total: number;
  impresso: boolean;
  observacoes?: string;
}

const STORAGE_KEY = "pedidos";
const GARCOM_DRAFT_KEY = "garcom-comanda-rascunho";
const SUCO_AO_LEITE_ACRESCIMO = 1;
const tamanhosPizza: PizzaSize[] = ["M", "G", "GG"];

interface GarcomDraft extends EstadoPedidoGarcom {
  meiaTamanho: PizzaSize;
  meiaSaborA: string;
  meiaSaborB: string;
}

const garcomDraftDefault: GarcomDraft = {
  nomeGarcom: "",
  numeroMesa: "",
  observacoes: "",
  carrinho: [],
  meiaTamanho: "G",
  meiaSaborA: String(pizzas[0]?.id ?? ""),
  meiaSaborB: String(pizzas[1]?.id ?? ""),
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const lerPedidos = (): PedidoMesa[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PedidoMesa[]) : [];
  } catch {
    return [];
  }
};

const lerGarcomDraft = (): GarcomDraft => {
  const raw = localStorage.getItem(GARCOM_DRAFT_KEY);
  if (!raw) return garcomDraftDefault;

  try {
    const parsed = JSON.parse(raw) as Partial<GarcomDraft>;

    return {
      ...garcomDraftDefault,
      ...parsed,
      carrinho: Array.isArray(parsed.carrinho) ? parsed.carrinho : [],
    };
  } catch {
    return garcomDraftDefault;
  }
};

const gerarIdPedido = () =>
  globalThis.crypto?.randomUUID?.() ??
  `MESA-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

function GarcomRoute() {
  return (
    <PinLock correctPin="5566" title="Tela do Garçom">
      <GarcomPage />
    </PinLock>
  );
}

function GarcomPage() {
  const [rascunhoInicial] = useState(() => lerGarcomDraft());
  const [pedido, setPedido] = useState<EstadoPedidoGarcom>({
    nomeGarcom: rascunhoInicial.nomeGarcom,
    numeroMesa: rascunhoInicial.numeroMesa,
    observacoes: rascunhoInicial.observacoes,
    carrinho: rascunhoInicial.carrinho,
  });
  const [meiaTamanho, setMeiaTamanho] = useState<PizzaSize>(rascunhoInicial.meiaTamanho);
  const [meiaSaborA, setMeiaSaborA] = useState(rascunhoInicial.meiaSaborA);
  const [meiaSaborB, setMeiaSaborB] = useState(rascunhoInicial.meiaSaborB);
  const [mensagemCarrinho, setMensagemCarrinho] = useState("");
  const mensagemTimeoutRef = useRef<number | null>(null);

  const subtotal = useMemo(
    () =>
      pedido.carrinho.reduce(
        (total, item) => total + item.precoUnitario * item.quantidade,
        0,
      ),
    [pedido.carrinho],
  );

  useEffect(() => {
    const draft: GarcomDraft = {
      ...pedido,
      meiaTamanho,
      meiaSaborA,
      meiaSaborB,
    };

    localStorage.setItem(GARCOM_DRAFT_KEY, JSON.stringify(draft));
  }, [meiaSaborA, meiaSaborB, meiaTamanho, pedido]);

  const avisarItemAdicionado = (nomeItem: string) => {
    setMensagemCarrinho(`${nomeItem} adicionado ao carrinho.`);

    if (mensagemTimeoutRef.current) {
      window.clearTimeout(mensagemTimeoutRef.current);
    }

    mensagemTimeoutRef.current = window.setTimeout(() => {
      setMensagemCarrinho("");
      mensagemTimeoutRef.current = null;
    }, 1800);
  };

  const adicionarItem = (item: Omit<ItemCarrinhoGarcom, "quantidade">) => {
    setPedido((estadoAtual) => {
      const existente = estadoAtual.carrinho.find((itemAtual) => itemAtual.key === item.key);
      const carrinho = existente
        ? estadoAtual.carrinho.map((itemAtual) =>
            itemAtual.key === item.key
              ? { ...itemAtual, quantidade: itemAtual.quantidade + 1 }
              : itemAtual,
          )
        : [...estadoAtual.carrinho, { ...item, quantidade: 1 }];

      return { ...estadoAtual, carrinho };
    });
    avisarItemAdicionado(item.nome);
  };

  const adicionarPizzaMeia = () => {
    const saborA = pizzas.find((pizza) => String(pizza.id) === meiaSaborA);
    const saborB = pizzas.find((pizza) => String(pizza.id) === meiaSaborB);

    if (!saborA || !saborB) {
      alert("Escolha os dois sabores da pizza meia a meia.");
      return;
    }

    adicionarItem({
      key: `pizza-meia-${meiaTamanho}-${saborA.id}-${saborB.id}`,
      id: saborA.id,
      nome: `Pizza meia ${saborA.name} / ${saborB.name}`,
      categoria: "pizza",
      tamanho: meiaTamanho,
      precoUnitario: Math.max(saborA.prices[meiaTamanho], saborB.prices[meiaTamanho]),
      meia: {
        saborA: saborA.name,
        saborB: saborB.name,
      },
    });
  };

  const alterarQuantidade = (key: string, delta: number) => {
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho
        .map((item) =>
          item.key === key ? { ...item, quantidade: item.quantidade + delta } : item,
        )
        .filter((item) => item.quantidade > 0),
    }));
  };

  const removerItem = (key: string) => {
    setPedido((estadoAtual) => ({
      ...estadoAtual,
      carrinho: estadoAtual.carrinho.filter((item) => item.key !== key),
    }));
  };

  const limparPedido = () => {
    setPedido({
      nomeGarcom: "",
      numeroMesa: "",
      observacoes: "",
      carrinho: [],
    });
  };

  const enviarPedido = () => {
    if (!pedido.nomeGarcom.trim()) {
      alert("Informe o nome do garçom.");
      return;
    }

    if (!pedido.numeroMesa.trim()) {
      alert("Informe o número da mesa.");
      return;
    }

    if (pedido.carrinho.length === 0) {
      alert("Adicione pelo menos um item ao pedido.");
      return;
    }

    const pedidoMesa: PedidoMesa = {
      id: gerarIdPedido(),
      data: new Date().toISOString(),
      origem: `MESA ${pedido.numeroMesa.trim()}`,
      garcom: pedido.nomeGarcom.trim(),
      mesa: pedido.numeroMesa.trim(),
      pagamento: "A DEFINIR NO CAIXA",
      itens: pedido.carrinho,
      subtotal,
      taxaEntrega: 0,
      total: subtotal,
      impresso: false,
      observacoes: pedido.observacoes.trim() || undefined,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify([pedidoMesa, ...lerPedidos()]));
    window.dispatchEvent(new Event("storage"));
    localStorage.removeItem(GARCOM_DRAFT_KEY);
    limparPedido();
    alert("Pedido enviado para o caixa.");
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              Atendimento de mesa
            </p>
            <h1 className="text-2xl font-black text-primary">Painel do Garçom</h1>
          </div>
        </div>
      </header>

      {mensagemCarrinho && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-24 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-800 shadow-[var(--shadow-card)]"
        >
          <CheckCircle2 size={18} aria-hidden="true" />
          {mensagemCarrinho}
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_390px]">
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <UserRound size={16} aria-hidden="true" />
                  Nome do Garçom
                </span>
                <input
                  value={pedido.nomeGarcom}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      nomeGarcom: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="Ex.: João"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-bold text-foreground">Número da Mesa</span>
                <input
                  value={pedido.numeroMesa}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      numeroMesa: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  inputMode="numeric"
                  className="h-11 w-full rounded-lg border-2 border-primary bg-background px-3 text-center text-lg font-black outline-none transition focus:ring-4 focus:ring-primary/10"
                  placeholder="00"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-foreground">Pizzas rápidas</h2>
                <p className="text-sm font-semibold text-muted-foreground">
                  Escolha o tamanho e envie para o carrinho da mesa.
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-lg border-2 border-dashed border-primary/45 bg-background p-4">
                <div className="mb-3">
                  <h3 className="text-lg font-black text-foreground">Pizza meia a meia</h3>
                  <p className="text-sm font-semibold text-muted-foreground">
                    O valor usa o maior preço entre os sabores escolhidos.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-[120px_1fr_1fr_auto]">
                  <select
                    value={meiaTamanho}
                    onChange={(event) => setMeiaTamanho(event.target.value as PizzaSize)}
                    className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-black outline-none focus:border-primary"
                  >
                    {tamanhosPizza.map((tamanho) => (
                      <option key={tamanho} value={tamanho}>
                        {tamanho}
                      </option>
                    ))}
                  </select>
                  <select
                    value={meiaSaborA}
                    onChange={(event) => setMeiaSaborA(event.target.value)}
                    className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                  >
                    {pizzas.map((pizza) => (
                      <option key={pizza.id} value={pizza.id}>
                        {pizza.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={meiaSaborB}
                    onChange={(event) => setMeiaSaborB(event.target.value)}
                    className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary"
                  >
                    {pizzas.map((pizza) => (
                      <option key={pizza.id} value={pizza.id}>
                        {pizza.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={adicionarPizzaMeia}
                    className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black uppercase text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                  >
                    <Plus size={17} aria-hidden="true" />
                    Add
                  </button>
                </div>
              </div>

              {pizzas.slice(0, 12).map((pizza) => (
                <article
                  key={pizza.id}
                  className="rounded-lg border border-border bg-background p-3 transition hover:border-primary"
                >
                  <div className="mb-3">
                    <h3 className="font-black text-foreground">{pizza.name}</h3>
                    <p className="text-xs font-medium text-muted-foreground">
                      {pizza.description}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {tamanhosPizza.map((tamanho) => (
                      <button
                        key={tamanho}
                        type="button"
                        onClick={() =>
                          adicionarItem({
                            key: `pizza-${pizza.id}-${tamanho}`,
                            id: pizza.id,
                            nome: `Pizza ${pizza.name}`,
                            categoria: "pizza",
                            tamanho,
                            precoUnitario: pizza.prices[tamanho],
                          })
                        }
                        className="rounded-lg border border-secondary bg-card px-3 py-2 text-center transition hover:border-primary hover:bg-secondary"
                      >
                        <span className="block text-xs font-black text-primary">{tamanho}</span>
                        <span className="block text-sm font-black text-foreground">
                          {formatCurrency(pizza.prices[tamanho])}
                        </span>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-lg font-black text-foreground">Itens rápidos</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {[...pasteis.slice(0, 6), ...porcoes, ...bebidas.slice(0, 6)].map((item) => (
                <button
                  key={`${item.id}-${item.name}`}
                  type="button"
                  onClick={() =>
                    adicionarItem({
                      key: `rapido-${item.id}`,
                      id: item.id,
                      nome: item.name,
                      categoria: item.id >= 29 ? "bebida" : item.id >= 28 ? "porcao" : "pastel",
                      precoUnitario: item.price,
                    })
                  }
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary hover:shadow-[var(--shadow-card)]"
                >
                  <span className="text-sm font-black text-foreground">{item.name}</span>
                  <span className="rounded-lg bg-secondary px-2 py-1 text-sm font-black text-secondary-foreground">
                    {formatCurrency(item.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4">
              <h2 className="text-lg font-black text-foreground">Sucos rápidos</h2>
              <p className="text-sm font-semibold text-muted-foreground">
                Ao leite tem acréscimo de {formatCurrency(SUCO_AO_LEITE_ACRESCIMO)}.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {sucos.map((suco) => (
                <article
                  key={suco.id}
                  className="rounded-lg border border-border bg-background p-3 transition hover:border-primary"
                >
                  <h3 className="mb-3 text-sm font-black text-foreground">{suco.name}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        adicionarItem({
                          key: `suco-${suco.id}-natural`,
                          id: suco.id,
                          nome: `Suco ${suco.name}`,
                          categoria: "suco",
                          precoUnitario: suco.price,
                        })
                      }
                      className="rounded-lg border border-secondary bg-card px-3 py-2 text-left transition hover:border-primary hover:bg-secondary"
                    >
                      <span className="block text-xs font-black uppercase text-muted-foreground">
                        Natural
                      </span>
                      <span className="block text-sm font-black text-foreground">
                        {formatCurrency(suco.price)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        adicionarItem({
                          key: `suco-${suco.id}-ao-leite`,
                          id: suco.id,
                          nome: `Suco ${suco.name} ao leite`,
                          categoria: "suco",
                          precoUnitario: suco.price + SUCO_AO_LEITE_ACRESCIMO,
                        })
                      }
                      className="rounded-lg border border-primary bg-secondary px-3 py-2 text-left transition hover:border-primary hover:bg-[var(--brand-yellow-light)]"
                    >
                      <span className="block text-xs font-black uppercase text-primary">
                        Ao leite
                      </span>
                      <span className="block text-sm font-black text-foreground">
                        {formatCurrency(suco.price + SUCO_AO_LEITE_ACRESCIMO)}
                      </span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="flex flex-col rounded-lg border-2 border-primary bg-card shadow-[var(--shadow-warm)]">
            <div className="flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
              <h2 className="flex items-center gap-2 text-lg font-black uppercase">
                <ShoppingCart size={19} aria-hidden="true" />
                Mesa {pedido.numeroMesa || "--"}
              </h2>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>

            <div className="p-2 sm:p-3">
              {pedido.carrinho.length === 0 ? (
                <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-border bg-background px-6 text-center">
                  <p className="text-sm font-semibold text-muted-foreground">
                    Nenhum item na comanda.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {pedido.carrinho.map((item) => (
                    <li key={item.key} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-foreground">
                            {item.nome}
                            {item.tamanho && (
                              <span className="ml-2 text-primary">({item.tamanho})</span>
                            )}
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {formatCurrency(item.precoUnitario)} cada
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removerItem(item.key)}
                          className="rounded-md p-1 text-destructive transition hover:bg-destructive/10"
                          aria-label={`Remover ${item.nome}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.key, -1)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
                            aria-label={`Diminuir ${item.nome}`}
                          >
                            <Minus size={16} aria-hidden="true" />
                          </button>
                          <span className="w-7 text-center text-sm font-black">
                            {item.quantidade}
                          </span>
                          <button
                            type="button"
                            onClick={() => alterarQuantidade(item.key, 1)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:bg-[var(--brand-red-dark)]"
                            aria-label={`Aumentar ${item.nome}`}
                          >
                            <Plus size={16} aria-hidden="true" />
                          </button>
                        </div>
                        <strong className="text-sm font-black text-primary">
                          {formatCurrency(item.precoUnitario * item.quantidade)}
                        </strong>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-3">
              <label className="mb-3 block space-y-2">
                <span className="text-sm font-bold text-foreground">Observações da mesa</span>
                <textarea
                  value={pedido.observacoes}
                  onChange={(event) =>
                    setPedido((estadoAtual) => ({
                      ...estadoAtual,
                      observacoes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                  placeholder="Ex.: servir pratos antes, sem cebola"
                />
              </label>

              <div className="mb-3 flex items-center justify-between rounded-lg bg-background p-3">
                <span className="text-sm font-black uppercase text-muted-foreground">Total</span>
                <span className="text-2xl font-black text-primary">{formatCurrency(subtotal)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={limparPedido}
                  disabled={pedido.carrinho.length === 0 && !pedido.numeroMesa && !pedido.nomeGarcom}
                  className="rounded-lg border border-border bg-background py-3 text-sm font-black uppercase text-foreground transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={enviarPedido}
                  disabled={pedido.carrinho.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-black uppercase text-primary-foreground shadow-[var(--shadow-warm)] transition hover:bg-[var(--brand-red-dark)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send size={17} aria-hidden="true" />
                  Enviar
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
