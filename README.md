# Comissão Certa

Motor de comissões de vendas com **regras de negócio versionadas, testadas e explicáveis**, para uma distribuidora B2B fictícia (Distribuidora Horizonte).

> 🚧 Em construção. Pronto até aqui: modelo de dados e **motor de regras com 48 testes**.

## O problema
Em muitas empresas a comissão é calculada em planilha. Faixas de meta, percentuais por categoria, devoluções e clientes inadimplentes viram fórmulas frágeis, e todo fim de mês alguém pergunta: *"por que eu recebi isso?"*

## As regras
| # | Regra | Parâmetros iniciais |
|---|---|---|
| R1 | Comissão base por categoria | Alimentos 2% · Bebidas 3% · Limpeza 4% · Higiene 3,5% |
| R2 | Multiplicador por atingimento da meta | < 70% → 0,5x · 70–99% → 1,0x · 100–119% → 1,2x · ≥ 120% → 1,5x |
| R3 | Estorno por devolução no mês em que ela ocorre | — |
| R4 | Estorno por inadimplência e reversão se o cliente pagar | tolerância de 60 dias |
| R5 | Bônus do gestor quando a equipe bate a meta coletiva | 10% da comissão da equipe |
| R6 | Teto mensal por vendedor | R$ 25.000,00 |
| R7 | Regras versionadas por vigência | mudar junho não altera maio |
| R8 | Fechamento do mês imutável e auditado | — |
| R9 | Dinheiro em centavos inteiros, arredondamento half-up por linha | — |

Cada linha de comissão guarda a **memória de cálculo** (itens, %, atingimento, faixa, versão), para que qualquer valor possa ser explicado.

Detalhes e decisões: [`docs/design.md`](docs/design.md).

## Rodar localmente
Pré-requisitos: Node 22+ e Docker.

```bash
cp .env.example .env        # gere um SESSION_SECRET novo (instrução no arquivo)
npm install
npm run db:up               # Postgres 16 na porta 5434
npm run db:migrate
npm test                    # testes do motor
npm run dev
```

## Stack
Next.js 16 · TypeScript · PostgreSQL 16 · Prisma 7 · Zod · Vitest · Tailwind CSS
