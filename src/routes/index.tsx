import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import logo from "@/assets/logo.jpeg";
import { pizzas, pasteis, porcoes, bebidas, sucos, type PizzaSize } from "@/data/menu";
import { OrderTicket } from "@/components/OrderTicket";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Pizzaria 2 Irmãos — Cardápio Digital" },
      { name: "description", content: "Cardápio digital da Pizzaria 2 Irmãos. Pedidos rápidos para o garçom enviar direto à impressora." },
    ],
  }),
});

type CartItem = {
  key: string;
  id: number;
  name: string;
  size?: PizzaSize;
  unitPrice: number;
  qty: number;
};

type Category = "pizzas" | "pasteis" | "porcoes" | "bebidas" | "sucos";

const tabs: { id: Category; label: string }[] = [
  { id: "pizzas", label: "🍕 Pizzas" },
  { id: "pasteis", label: "🥟 Pastéis" },
  { id: "porcoes", label: "🍟 Porções" },
  { id: "bebidas", label: "🥤 Bebidas" },
  { id: "sucos", label: "🍹 Sucos" },
];

function Index() {
  // 1. O estado do Modo Caixa precisa estar AQUI DENTRO, junto com os outros states.
  const [isCashier, setIsCashier] = useState(() => localStorage.getItem("modoCaixa") === "true");

  const [tab, setTab] = useState<Category>("pizzas");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [waiter, setWaiter] = useState("");
  const [table, setTable] = useState("");
  const [notes, setNotes] = useState("");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);

  const total = useMemo(() => cart.reduce((s, i) => s + i.unitPrice * i.qty, 0), [cart]);

  // 2. A função que altera o Modo Caixa também fica aqui dentro
  const toggleCashier = () => {
    const newState = !isCashier;
    setIsCashier(newState);
    localStorage.setItem("modoCaixa", String(newState));
  };

  const addItem = (item: Omit<CartItem, "qty" | "key"> & { key: string }) => {
    setCart((prev) => {
      const found = prev.find((p) => p.key === item.key);
      if (found) return prev.map((p) => (p.key === item.key ? { ...p, qty: p.qty + 1 } : p));
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((p) => (p.key === key ? { ...p, qty: p.qty + delta } : p))
        .filter((p) => p.qty > 0),
    );
  };

  const removeItem = (key: string) =>
    setCart((prev) => prev.filter((p) => p.key !== key));

  const clearCart = () => {
    setCart([]);
    setNotes("");
  };

  // 3. O botão de Enviar/Imprimir agora sabe se é Garçom ou Caixa
  const handleAction = () => {
    if (cart.length === 0) return;
    if (!table.trim()) {
      alert("Informe o número da mesa antes de enviar para a impressora.");
      return;
    }

    const num = Math.floor(Date.now() / 1000) % 10000;
    setOrderNumber(num);

    if (isCashier) {
      // Se for o computador do Caixa, ele imprime direto o que montou na tela dele
      setTimeout(() => {
        window.print();
        clearCart(); // Limpa depois de imprimir
      }, 100);
    } else {
      // Se for o Garçom, ele não tenta imprimir. Apenas "envia" (futuramente para o Firebase)
      alert("Pedido enviado para o Caixa! (Aguardando integração com Firebase)");
      clearCart();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="no-print sticky top-0 z-30 border-b-4 border-primary bg-card shadow-[var(--shadow-card)]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <img src={logo} alt="Pizzaria 2 Irmãos" className="h-16 w-16 rounded-full object-cover ring-4 ring-secondary" />
          <div className="flex-1">
            <h1 className="text-2xl font-black uppercase tracking-tight text-primary md:text-3xl">
              Pizzaria 2 Irmãos
            </h1>
            <p className="text-xs font-medium text-muted-foreground md:text-sm">
              Cardápio do garçom · Terça a Domingo · 18h às 22h
            </p>
          </div>

          {/* Botão de Modo Caixa (Apenas Visível em Telas Médias/Grandes para não poluir o celular) */}
          <button
            onClick={toggleCashier}
            className={`hidden md:flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-bold transition-all ${isCashier
                ? "border-green-500 bg-green-100 text-green-700"
                : "border-border bg-card text-muted-foreground"
              }`}
          >
            <Printer size={18} />
            {isCashier ? "Caixa Ativo" : "Modo Garçom"}
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <input
              value={waiter}
              onChange={(e) => setWaiter(e.target.value)}
              placeholder="Garçom"
              className="w-28 rounded-lg border-2 border-border bg-background px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none"
            />
            <input
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder="Mesa"
              className="w-20 rounded-lg border-2 border-primary bg-secondary px-3 py-2 text-center text-sm font-bold focus:outline-none"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_400px]">
        {/* MENU */}
        <main className="no-print">
          {/* Mobile waiter/table */}
          <div className="mb-4 flex gap-2 md:hidden">
            <input
              value={waiter}
              onChange={(e) => setWaiter(e.target.value)}
              placeholder="Garçom"
              className="flex-1 rounded-lg border-2 border-border bg-card px-3 py-2 text-sm font-medium"
            />
            <input
              value={table}
              onChange={(e) => setTable(e.target.value)}
              placeholder="Mesa"
              className="w-24 rounded-lg border-2 border-primary bg-secondary px-3 py-2 text-center text-sm font-bold"
            />
          </div>

          {/* Tabs */}
          <div className="mb-5 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all ${tab === t.id
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-warm)]"
                    : "bg-card text-foreground hover:bg-secondary"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "pizzas" && (
            <div className="grid gap-3">
              {pizzas.map((p) => (
                <div key={p.id} className="rounded-2xl border-2 border-border bg-card p-4 shadow-[var(--shadow-card)] transition-all hover:border-primary">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <h3 className="text-lg font-extrabold text-foreground">
                      <span className="mr-2 text-primary">{String(p.id).padStart(2, "0")}.</span>
                      {p.name}
                    </h3>
                  </div>
                  <p className="mb-2 text-xs italic text-muted-foreground">{p.description}</p>
                  {p.highlight && (
                    <p className="mb-3 text-xs font-bold text-primary">★ {p.highlight}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {(["M", "G", "GG"] as PizzaSize[]).map((size) => (
                      <button
                        key={size}
                        onClick={() =>
                          addItem({
                            key: `pizza-${p.id}-${size}`,
                            id: p.id,
                            name: `Pizza ${p.name}`,
                            size,
                            unitPrice: p.prices[size],
                          })
                        }
                        className="group flex flex-col items-center rounded-xl border-2 border-secondary bg-[var(--gradient-warm)] py-2 transition-all hover:border-primary hover:shadow-[var(--shadow-warm)]"
                      >
                        <span className="text-xs font-black text-primary">{size}</span>
                        <span className="text-sm font-bold text-foreground">
                          R$ {p.prices[size].toFixed(2)}
                        </span>
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground group-hover:text-primary">
                          + Add
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab !== "pizzas" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(tab === "pasteis" ? pasteis : tab === "porcoes" ? porcoes : tab === "bebidas" ? bebidas : sucos).map((it) => (
                <button
                  key={it.id}
                  onClick={() =>
                    addItem({
                      key: `${tab}-${it.id}`,
                      id: it.id,
                      name: it.name,
                      unitPrice: it.price,
                    })
                  }
                  className="flex items-center justify-between rounded-2xl border-2 border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-all hover:border-primary hover:shadow-[var(--shadow-warm)]"
                >
                  <div>
                    <h3 className="font-extrabold text-foreground">
                      <span className="mr-2 text-primary">{it.id}.</span>
                      {it.name}
                    </h3>
                    <span className="text-xs font-semibold uppercase text-muted-foreground">Toque para adicionar</span>
                  </div>
                  <span className="rounded-lg bg-secondary px-3 py-1 text-base font-black text-primary">
                    R$ {it.price.toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* CART */}
        <aside className="no-print lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
          <div className="flex h-full flex-col rounded-2xl border-4 border-primary bg-card shadow-[var(--shadow-warm)]">
            <div className="rounded-t-xl bg-primary px-4 py-3">
              <h2 className="text-lg font-black uppercase tracking-wide text-primary-foreground">
                🧾 Pedido {table && `· Mesa ${table}`}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {cart.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum item adicionado.<br />Toque nos itens do cardápio.
                </p>
              ) : (
                <ul className="space-y-2">
                  {cart.map((i) => (
                    <li key={i.key} className="rounded-lg border border-border bg-background p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-bold text-foreground">
                            {i.name} {i.size && <span className="text-primary">({i.size})</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            R$ {i.unitPrice.toFixed(2)} cada
                          </p>
                        </div>
                        <button
                          onClick={() => removeItem(i.key)}
                          className="text-xs font-bold text-destructive hover:underline"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQty(i.key, -1)}
                            className="h-7 w-7 rounded-full bg-secondary font-black text-primary"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-black">{i.qty}</span>
                          <button
                            onClick={() => updateQty(i.key, 1)}
                            className="h-7 w-7 rounded-full bg-primary font-black text-primary-foreground"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm font-black text-primary">
                          R$ {(i.unitPrice * i.qty).toFixed(2)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t-2 border-border p-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações (sem cebola, ponto da carne…)"
                className="mb-3 w-full resize-none rounded-lg border-2 border-border bg-background p-2 text-xs focus:border-primary focus:outline-none"
                rows={2}
              />
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold uppercase text-muted-foreground">Total</span>
                <span className="text-2xl font-black text-primary">R$ {total.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={clearCart}
                  disabled={cart.length === 0}
                  className="rounded-lg border-2 border-border bg-background py-2 text-sm font-bold uppercase text-foreground disabled:opacity-40"
                >
                  Limpar
                </button>
                <button
                  onClick={handleAction}
                  disabled={cart.length === 0}
                  className="rounded-lg bg-primary py-2 text-sm font-black uppercase text-primary-foreground shadow-[var(--shadow-warm)] transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                >
                  {isCashier ? "🖨 Imprimir" : "🚀 Enviar Pedido"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* PRINT-ONLY TICKET */}
      <OrderTicket
        items={cart}
        total={total}
        waiter={waiter}
        table={table}
        notes={notes}
        orderNumber={orderNumber ?? 0}
      />
    </div>
  );
}