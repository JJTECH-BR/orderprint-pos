export type PizzaSize = "M" | "G" | "GG";

export interface PizzaItem {
  id: number;
  name: string;
  description: string;
  prices: Record<PizzaSize, number>;
  highlight?: string;
}

export interface SimpleItem {
  id: number;
  name: string;
  price: number;
  description?: string;
}

export const pizzas: PizzaItem[] = [
  { id: 1, name: "Mussarela", description: "Mussarela, tomate, azeitona e orégano", prices: { M: 25, G: 35, GG: 45 }, highlight: "Grátis 1 refrigerante de 1lt nas G e GG" },
  { id: 2, name: "Calabresa", description: "Mussarela, calabresa, cebola, azeitona e orégano", prices: { M: 25, G: 35, GG: 45 }, highlight: "Grátis 1 refrigerante de 1lt nas G e GG" },
  { id: 3, name: "Napolitano", description: "Mussarela, calabresa, presunto, tomate, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 4, name: "Quatro Queijo", description: "Mussarela, requeijão, queijo coalho, cheddar, tomate, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 5, name: "Frango Catupiry", description: "Mussarela, frango, catupiry, tomate, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 6, name: "Frango com Bacon", description: "Mussarela, bacon, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 7, name: "Sertanejo", description: "Mussarela, carne de sol, queijo coalho, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 8, name: "Bacon", description: "Mussarela, bacon, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 9, name: "Baiana", description: "Mussarela, calabresa picante, pimenta, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 10, name: "Portuguesa", description: "Mussarela, presunto, ovos, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 11, name: "Quatro Sabores", description: "Mussarela, sertaneja, frango e calabresa", prices: { M: 30, G: 40, GG: 50 } },
  { id: 12, name: "Atum", description: "Mussarela, atum, cebola, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 13, name: "Camarão", description: "Mussarela, camarão, cebola, azeitona e orégano", prices: { M: 40, G: 50, GG: 60 } },
  { id: 14, name: "Frango com Cheddar", description: "Mussarela, frango, cheddar, tomate, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 15, name: "Catupireza", description: "Mussarela, calabresa, catupiry, cebola, tomate, azeitona e orégano", prices: { M: 30, G: 40, GG: 50 } },
  { id: 16, name: "Brigadeiro", description: "Pizza doce de brigadeiro", prices: { M: 30, G: 35, GG: 40 } },
  { id: 17, name: "Prestígio", description: "Pizza doce de prestígio", prices: { M: 30, G: 35, GG: 40 } },
  { id: 18, name: "Chocolate", description: "Pizza doce de chocolate", prices: { M: 30, G: 35, GG: 40 } },
];

export const pasteis: SimpleItem[] = [
  { id: 19, name: "Carne de Sol", price: 10 },
  { id: 20, name: "Calabresa", price: 10 },
  { id: 21, name: "Pizza", price: 10 },
  { id: 22, name: "Frango com Catupiry", price: 10 },
  { id: 23, name: "Mussarela", price: 10 },
  { id: 24, name: "Quatro Queijo", price: 10 },
  { id: 25, name: "Chocolate", price: 10 },
  { id: 26, name: "Misto (Presunto e queijo)", price: 10 },
  { id: 27, name: "Frango com Cheddar", price: 10 },
];

export const porcoes: SimpleItem[] = [
  { id: 28, name: "Batata frita (G)", price: 20 },
];

export const bebidas: SimpleItem[] = [
  { id: 29, name: "Água 500ml", price: 3 },
  { id: 30, name: "Água com Gás 500ml", price: 3.5 },
  { id: 31, name: "Refrigerante Lata", price: 5 },
  { id: 32, name: "Pepsi 1L", price: 9 },
  { id: 33, name: "Guaraná 1L", price: 9 },
  { id: 34, name: "Coca-Cola 2L", price: 15 },
  { id: 35, name: "Pepsi 2L", price: 15 },
  { id: 36, name: "Guaraná 2L", price: 15 },
];

export const sucos: SimpleItem[] = [
  { id: 37, name: "Acerola", price: 7 },
  { id: 38, name: "Cajá", price: 7 },
  { id: 39, name: "Mangaba", price: 7 },
  { id: 40, name: "Graviola", price: 7 },
  { id: 41, name: "Uva", price: 7 },
  { id: 42, name: "Maracujá", price: 8 },
  { id: 43, name: "Goiaba", price: 7 },
];
