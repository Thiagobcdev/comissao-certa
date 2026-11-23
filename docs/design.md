# Comissão Certa — design do MVP

> Status: **implementado** (23/11/2026). Este é o design aprovado antes da construção; o README descreve o resultado e as decisões tomadas no caminho.

## 1. O que é e por quê
Motor de comissões de vendas para uma **distribuidora B2B fictícia**. Projeto de vitrine do GitHub de Thiago B Clemente. O objetivo é provar o diferencial do portfólio, **"entendo a regra de negócio e construo o sistema inteiro"**, com regras reais, versionadas, testadas e explicáveis.

**Sucesso** = um recrutador ou cliente abre o repositório e, em 2 minutos, vê:
1. um README em formato de case (problema → regras → decisões → screenshots);
2. o motor de regras com testes legíveis ("vendedor com 115% da meta recebe 1,2x");
3. o painel rodando com dados realistas a partir de um comando (`docker compose up` + `npm run seed`).

**Não-objetivos do MVP:** multi-empresa (multi-tenant), pagamento, envio de e-mail, deploy em nuvem, app mobile.
**Antiobjetivo:** parecer CRUD de tutorial. Se as regras não estiverem no centro, o projeto falhou, mesmo funcionando.

## 2. Cenário: Distribuidora Horizonte (fictícia)
- 3 equipes (Centro-Oeste, Nordeste, Sudeste), cada uma com 1 gestor e 4 vendedores.
- 4 categorias de produto: Alimentos, Bebidas, Limpeza e Higiene.
- Metas mensais por vendedor; 6 meses de histórico com ~2.000 pedidos, incluindo devoluções e inadimplência.

## 3. Regras de negócio (o coração do projeto)
| # | Regra | Exemplo (parâmetros da versão inicial) |
|---|---|---|
| R1 | **Comissão base por categoria** sobre o valor faturado do item | Alimentos 2% · Bebidas 3% · Limpeza 4% · Higiene 3,5% |
| R2 | **Multiplicador por atingimento de meta** (faturado no mês ÷ meta) | < 70%: 0,5x · 70–99%: 1,0x · 100–119%: 1,2x · ≥ 120%: 1,5x |
| R3 | **Estorno por devolução**: devolução de venda já comissionada gera linha negativa **no mês da devolução** | Devolução de R$ 1.000 em Bebidas → −R$ 30 × multiplicador do mês original |
| R4 | **Estorno por inadimplência**: título vencido há > 60 dias estorna a comissão; se o cliente pagar depois, a comissão volta | Configurável: dias de tolerância |
| R5 | **Bônus do gestor**: % sobre a comissão da equipe **se a equipe bater a meta coletiva** | 10% da comissão total da equipe |
| R6 | **Teto mensal** por vendedor | R$ 25.000,00 |
| R7 | **Versionamento**: cada venda usa a versão de regras **vigente na data da venda**; nova versão = nova vigência, a anterior é preservada | Mudança em março não altera fevereiro |
| R8 | **Fechamento imutável**: depois de fechado, o mês não muda; ajustes posteriores entram como estorno ou crédito no próximo fechamento | Auditoria de quem fechou e quando |
| R9 | **Dinheiro sem float**: valores em centavos (inteiro) e percentuais em pontos-base; arredondamento half-up **por linha** | Documentado e testado |

Toda linha de comissão guarda uma **memória de cálculo** (base, %, multiplicador, regra e versão). O vendedor vê exatamente por que recebeu aquele valor.

## 4. Abordagem do motor
**Escolhida: regras como dados tipados.** Cada tipo de regra (R1–R6) é uma **função pura em TypeScript** em `src/domain/commission/`, sem Prisma e sem framework. Os parâmetros ficam em `VersaoPlano.regras` (JSON validado por **Zod**). O cálculo é `calcularFechamento(vendas, metas, versões, equipes) → linhas[]`, determinístico e testável com tabelas de casos.

Descartadas:
- **DSL genérica (json-logic):** flexível, mas esconde a regra de negócio.
- **Regras em SQL/procedures:** difíceis de testar e de explicar.

## 5. Stack
| Camada | Escolha |
|---|---|
| App | Next.js 16 (App Router, Server Actions) + TypeScript estrito |
| Banco | PostgreSQL 16 em Docker Compose (**porta 5434**, sem conflito com os containers existentes) |
| ORM | Prisma (migrações + seed) |
| Validação | Zod (regras, formulários e importação de CSV) |
| UI | Tailwind v4 + shadcn/ui + Recharts (gráficos) |
| Auth | Login por e-mail e senha (usuários do seed) com sessão em cookie; 3 papéis: **ADMIN, GESTOR, VENDEDOR**. Biblioteca a confirmar via context7 (compatibilidade com Next 16) |
| Testes | Vitest (motor: unidade, orientado a tabela) + teste de integração do fechamento contra um banco de teste |

## 6. Modelo de dados (resumo)
`Equipe`, `Usuario(papel, equipeId)`, `Categoria`, `Venda(numeroPedido, vendedorId, data, status: FATURADA|DEVOLVIDA, vencimento, pagoEm)`, `ItemVenda(categoriaId, valorCentavos)`, `Meta(vendedorId, competencia, valorCentavos)`, `MetaEquipe`, `PlanoComissao` → `VersaoPlano(vigenciaInicio, regras JSON, publicadaPor)`, `Fechamento(competencia, status ABERTO|FECHADO, fechadoPor/Em)`, `LinhaComissao(fechamentoId, vendedorId, tipo: BASE|ESTORNO|BONUS_GESTOR|AJUSTE_TETO, valorCentavos, memoria JSON)` e `Auditoria`.

## 7. Telas
- **Admin**
  - **Regras:** lista de versões; editar cria um rascunho; "publicar" exige a data de vigência e mostra um diff de parâmetros.
  - **Importar vendas (CSV):** validação linha a linha com relatório de erros; nada é gravado se houver erro.
  - **Fechamento do mês:** prévia → conferência → fechar (irreversível, com confirmação).
- **Gestor**
  - **Painel da equipe:** atingimento por vendedor, comissão projetada, ranking e gráfico mês a mês.
- **Vendedor**
  - **Extrato:** linhas com memória de cálculo.
  - **Simulador:** "se eu vender +R$ X em Bebidas até o fim do mês" → nova faixa e nova comissão.

## 8. Estrutura do repositório
```
comissao-certa/
  docker-compose.yml        # postgres:16 na porta 5434
  prisma/ (schema, migrations, seed.ts)
  src/domain/commission/    # motor puro + testes (*.test.ts)
  src/server/               # repositórios, serviços, server actions
  src/app/                  # rotas: (auth)/login, admin/*, gestor/*, vendedor/*
  docs/ (design.md, regras.md, decisoes/ADR-*.md)
  README.md                 # case: problema → regras → decisões → prints
```

## 9. Ordem de construção (fatias verticais)
1. Base: projeto, Docker, Prisma, schema e seed.
2. **Motor de regras + testes (R1–R9)**, o núcleo, sem UI.
3. Auth e papéis.
4. Extrato do vendedor + memória de cálculo.
5. Painel do gestor.
6. Admin: regras versionadas → importação de CSV → fechamento.
7. Simulador.
8. README em formato de case + screenshots → repositório pronto para ficar público.

## 10. O que fica para o construtor decidir
Biblioteca de auth (após checar a compatibilidade com Next 16), layout visual (sóbrio, estilo dashboard; shadcn), formato exato do CSV (documentado no README) e paleta dos gráficos.
