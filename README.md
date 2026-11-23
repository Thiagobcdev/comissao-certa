# Comissão Certa

Motor de comissões de vendas com **regras de negócio versionadas, testadas e explicáveis**, para uma distribuidora B2B fictícia (Distribuidora Horizonte).

> 🚧 Em construção. Pronto até aqui: **motor de regras com 48 testes**, fechamento imutável, seed realista, login com 3 papéis e **extrato do vendedor com memória de cálculo**.

![Extrato do vendedor: cada lançamento explica como o valor foi calculado](docs/img/extrato-vendedor.png)

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

## Telas
- **Extrato do vendedor** (`/vendedor`): comissão do mês, atingimento, multiplicador e cada lançamento com a memória de cálculo.
- **Simulador do vendedor** (`/vendedor/simulador`): "se eu vender +R$ X em Bebidas até o fim do mês" → novo atingimento, nova faixa e nova comissão, com atalho para completar a próxima faixa na categoria que mais rende. Roda o mesmo motor no navegador, com a entrada recortada só para o vendedor logado (`entradaDoVendedor`): vendas de colegas e metas de equipe não saem do servidor.
- **Painel do gestor** (`/gestor`): resumo da equipe, bônus do gestor (R5), ranking dos vendedores e evolução mês a mês. No mês em aberto mostra a **prévia** ("se fechasse hoje") e uma **projeção** para o fim do mês: o ritmo de vendas é extrapolado e recalculado pelo mesmo motor, então faixa, teto e bônus são aplicados como num fechamento real (`src/domain/commission/projecao.ts`).

- **Regras (admin)** (`/admin/regras`): histórico de versões com o que mudou em cada uma. Uma nova versão parte da vigente, passa por uma revisão com o diff de parâmetros e só pode valer a partir de um mês ainda não fechado (R7/R8). A validação fica em funções puras (`src/domain/commission/versoes.ts`) e é refeita dentro da transação de publicação.

- **Importar vendas (admin)** (`/admin/importar`): CSV com uma linha por item (`pedido;data;vendedor;cliente;vencimento;categoria;valor`, modelo em `public/modelo-vendas.csv`). O arquivo é validado linha a linha com relatório de erros: pedido repetido, mês já fechado (R8), vendedor sem meta, categoria desconhecida, valor ou data inválidos. Se houver qualquer erro, nada é gravado; a gravação valida de novo dentro da transação.

- **Fechamento (admin)** (`/admin/fechamento`): prévia do próximo mês com conferência por tipo de lançamento e por equipe, alertas (teto, saldo negativo, vendedor sem vendas, bônus) e fechamento com confirmação digitada, liberado só depois do fim do mês. Abaixo, o histórico dos meses fechados com a versão de regras usada.

## Rodar localmente
Pré-requisitos: Node 22+ e Docker.

```bash
cp .env.example .env        # gere um SESSION_SECRET novo (instrução no arquivo)
npm install
npm run db:up               # Postgres 16 na porta 5434
npm run db:migrate
npm run db:seed             # Distribuidora Horizonte: ~4.900 pedidos, jun–out fechados
npm test                    # testes do motor
npm run dev
```

**Contas de demonstração** (senha `horizonte123`, apenas local):

| Papel | E-mail |
|---|---|
| Admin | `admin@horizonte.test` |
| Gestora (Centro-Oeste) | `marina.costa@horizonte.test` |
| Vendedora | `ana.ribeiro@horizonte.test` |

## Segurança
- Sessão em JWT (HS256, `jose`) num cookie httpOnly com `SameSite=Lax` e validade de 8 h.
- Senhas com bcrypt. O login responde no mesmo tempo para contas existentes e inexistentes.
- O `proxy` faz uma checagem otimista por rota e papel. **Toda leitura de dados confere a sessão e o papel de novo** no servidor (`src/server/auth.ts`).

## Stack
Next.js 16 · TypeScript · PostgreSQL 16 · Prisma 7 · Zod · Vitest · Tailwind CSS
