/**
 * Seed da Distribuidora Horizonte (fictícia) — dados realistas e REPRODUTÍVEIS (PRNG com semente fixa).
 *   npm run db:reset   (recria o banco e roda este seed)
 *
 * Cria: 4 categorias · 1 admin · 3 gestores · 12 vendedores · metas · 2 versões de regras
 *       ~6 meses de pedidos (jun–nov/2026) com devoluções e inadimplência
 *       e FECHA jun–out usando o mesmo serviço da aplicação (novembro fica aberto).
 *
 * Login (todos os usuários): senha "horizonte123" — apenas para desenvolvimento local.
 */
import bcrypt from "bcryptjs";
import { REGRAS_INICIAIS, paraISO, proximaCompetencia, ultimoDia } from "../src/domain/commission";
import { criarPrisma } from "../src/server/db";
import { fecharCompetencia } from "../src/server/fechamento";

const db = criarPrisma();
const SENHA = "horizonte123";
const HOJE = "2026-11-22";
const PRIMEIRA = "2026-06";
const COMPETENCIAS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

// ── PRNG determinístico (mulberry32) ──
let estado = 20261122;
function rand(): number {
  estado |= 0;
  estado = (estado + 0x6d2b79f5) | 0;
  let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entre = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const escolher = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
function escolherPeso<T>(opcoes: readonly [T, number][]): T {
  const total = opcoes.reduce((s, [, p]) => s + p, 0);
  let r = rand() * total;
  for (const [v, p] of opcoes) if ((r -= p) <= 0) return v;
  return opcoes[opcoes.length - 1][0];
}
function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraISO(d);
}
const dt = (iso: string) => new Date(`${iso}T00:00:00Z`);

const EQUIPES = [
  { nome: "Centro-Oeste", gestor: "Marina Costa", vendedores: ["Ana Ribeiro", "Bruno Almeida", "Carla Mendes", "Diego Souza"] },
  { nome: "Nordeste", gestor: "Rafael Lima", vendedores: ["Eduarda Nunes", "Felipe Rocha", "Gabriela Pires", "Heitor Barros"] },
  { nome: "Sudeste", gestor: "Juliana Prado", vendedores: ["Igor Teixeira", "Larissa Duarte", "Mateus Farias", "Natália Gomes"] },
];

// Perfil de desempenho: fator médio sobre a meta (gera vendedores em todas as faixas)
const PERFIS = [1.28, 1.05, 0.88, 0.62, 1.12, 0.95, 0.74, 1.35, 1.02, 0.83, 1.18, 0.66];

const CLIENTES = [
  "Mercado Bom Preço", "Supermercado Central", "Atacadão do Bairro", "Empório Santa Luzia", "Rede Economia",
  "Mercadinho Sol Nascente", "Padaria Pão Dourado", "Hipermercado Planalto", "Conveniência 24h", "Mercearia São Jorge",
  "Distribuidora Vale Verde", "Mini Mercado Esperança", "Restaurante Sabor Caseiro", "Hotel Lago Azul", "Farmácia Vida",
];

const email = (nome: string) =>
  `${nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, ".")}@horizonte.test`;

async function main() {
  console.log("🌱 Limpando dados…");
  await db.auditoria.deleteMany();
  await db.linhaComissao.deleteMany();
  await db.fechamento.deleteMany();
  await db.itemVenda.deleteMany();
  await db.venda.deleteMany();
  await db.meta.deleteMany();
  await db.metaEquipe.deleteMany();
  await db.versaoRegras.deleteMany();
  await db.equipe.updateMany({ data: { gestorId: null } });
  await db.usuario.updateMany({ data: { equipeId: null } });
  await db.equipe.deleteMany();
  await db.usuario.deleteMany();
  await db.categoria.deleteMany();

  const senhaHash = await bcrypt.hash(SENHA, 10);

  console.log("🗂️  Categorias");
  const categorias = await Promise.all(
    [
      ["alimentos", "Alimentos"],
      ["bebidas", "Bebidas"],
      ["limpeza", "Limpeza"],
      ["higiene", "Higiene"],
    ].map(([slug, nome]) => db.categoria.create({ data: { slug, nome } })),
  );

  console.log("👥 Usuários e equipes");
  const admin = await db.usuario.create({
    data: { nome: "Admin Horizonte", email: "admin@horizonte.test", senhaHash, papel: "ADMIN" },
  });

  const vendedores: { id: string; perfil: number; equipeId: string }[] = [];
  let iPerfil = 0;
  for (const e of EQUIPES) {
    const gestor = await db.usuario.create({ data: { nome: e.gestor, email: email(e.gestor), senhaHash, papel: "GESTOR" } });
    const equipe = await db.equipe.create({ data: { nome: e.nome, gestorId: gestor.id } });
    await db.usuario.update({ where: { id: gestor.id }, data: { equipeId: equipe.id } });
    for (const nome of e.vendedores) {
      const v = await db.usuario.create({
        data: { nome, email: email(nome), senhaHash, papel: "VENDEDOR", equipeId: equipe.id },
      });
      vendedores.push({ id: v.id, perfil: PERFIS[iPerfil++], equipeId: equipe.id });
    }
  }

  console.log("📜 Versões de regras (R7)");
  await db.versaoRegras.create({
    data: {
      vigenciaInicio: dt(`${PRIMEIRA}-01`),
      descricao: "Versão inicial",
      regras: REGRAS_INICIAIS,
      publicadaPorId: admin.id,
    },
  });
  await db.versaoRegras.create({
    data: {
      vigenciaInicio: dt("2026-09-01"),
      descricao: "Campanha Higiene: categoria sobe de 3,5% para 4,5%",
      regras: { ...REGRAS_INICIAIS, categorias: { ...REGRAS_INICIAIS.categorias, higiene: 450 } },
      publicadaPorId: admin.id,
    },
  });

  console.log("🎯 Metas e 🧾 vendas");
  let numero = 10_000;
  let totalVendas = 0;
  for (const competencia of COMPETENCIAS) {
    const fimMes = ultimoDia(competencia);
    const ultimoDiaComVenda = fimMes < HOJE ? fimMes : HOJE;
    const metasPorEquipe = new Map<string, number>();

    for (const v of vendedores) {
      const meta = entre(80, 140) * 1_000_00; // R$ 80 mil a R$ 140 mil
      await db.meta.create({ data: { vendedorId: v.id, competencia, valorCentavos: meta } });
      metasPorEquipe.set(v.equipeId, (metasPorEquipe.get(v.equipeId) ?? 0) + meta);

      // Alvo de faturamento do mês: perfil ± ruído (mês corrente proporcional aos dias corridos)
      const diasNoMes = Number(fimMes.slice(8));
      const proporcao = Number(ultimoDiaComVenda.slice(8)) / diasNoMes;
      let alvo = Math.round(meta * (v.perfil + (rand() - 0.5) * 0.3) * proporcao);

      while (alvo > 0) {
        const data = `${competencia}-${String(entre(1, Number(ultimoDiaComVenda.slice(8)))).padStart(2, "0")}`;
        const qtdItens = entre(1, 4);
        const itens = Array.from({ length: qtdItens }, () => ({
          categoriaId: escolherPeso([
            [categorias[0].id, 40],
            [categorias[1].id, 30],
            [categorias[2].id, 18],
            [categorias[3].id, 12],
          ] as const),
          valorCentavos: entre(30_00, 1_200_00),
        }));
        const total = itens.reduce((s, i) => s + i.valorCentavos, 0);
        alvo -= total;

        const vencimento = somarDias(data, 28);
        // 88% paga até 20 dias após o vencimento · 8% paga com atraso · 4% não paga
        const pagamento = escolherPeso([
          ["em-dia", 88],
          ["atrasado", 8],
          ["calote", 4],
        ] as const);
        let pagoEm: string | null =
          pagamento === "em-dia" ? somarDias(vencimento, entre(-5, 20)) : pagamento === "atrasado" ? somarDias(vencimento, entre(65, 120)) : null;
        if (pagoEm && pagoEm > HOJE) pagoEm = null;

        let devolvidaEm: string | null = rand() < 0.03 ? somarDias(data, entre(2, 45)) : null;
        if (devolvidaEm && devolvidaEm > HOJE) devolvidaEm = null;
        if (devolvidaEm) pagoEm = null;

        await db.venda.create({
          data: {
            numeroPedido: `PED-${numero++}`,
            vendedorId: v.id,
            clienteNome: escolher(CLIENTES),
            data: dt(data),
            vencimento: dt(vencimento),
            pagoEm: pagoEm ? dt(pagoEm) : null,
            devolvidaEm: devolvidaEm ? dt(devolvidaEm) : null,
            itens: { create: itens },
          },
        });
        totalVendas++;
      }
    }

    // Evento de demonstração do teto (R6): em outubro, o melhor vendedor fecha um contrato anual grande.
    // R$ 650 mil em Limpeza (4%) a 1,5x ≈ R$ 39 mil de comissão → corte no teto de R$ 25 mil.
    if (competencia === "2026-10") {
      const estrela = vendedores[7]; // perfil 1,35
      await db.venda.create({
        data: {
          numeroPedido: `PED-${numero++}`,
          vendedorId: estrela.id,
          clienteNome: "Rede Economia — contrato anual",
          data: dt("2026-10-15"),
          vencimento: dt("2026-11-12"),
          pagoEm: dt("2026-11-10"),
          itens: { create: [{ categoriaId: categorias[2].id, valorCentavos: 650_000_00 }] },
        },
      });
      totalVendas++;
    }

    for (const [equipeId, soma] of metasPorEquipe) {
      // Meta coletiva = 95% da soma das metas individuais
      await db.metaEquipe.create({ data: { equipeId, competencia, valorCentavos: Math.round(soma * 0.95) } });
    }
  }
  console.log(`   ${totalVendas} pedidos criados`);

  console.log("🔒 Fechamentos (R8) — de junho a outubro");
  for (let c = PRIMEIRA; c < HOJE.slice(0, 7); c = proximaCompetencia(c)) {
    const { resultado } = await fecharCompetencia(db, c, admin.id, HOJE);
    console.log(
      `   ${c}: ${resultado.linhas.length} linhas · total R$ ${(resultado.totalCentavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    );
  }

  console.log("\n✅ Pronto. Logins (senha: horizonte123):");
  console.log("   admin@horizonte.test · marina.costa@horizonte.test (gestora) · ana.ribeiro@horizonte.test (vendedora)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
