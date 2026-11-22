-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'GESTOR', 'VENDEDOR');

-- CreateEnum
CREATE TYPE "TipoLinha" AS ENUM ('BASE', 'AJUSTE_TETO', 'BONUS_GESTOR', 'ESTORNO_DEVOLUCAO', 'ESTORNO_INADIMPLENCIA', 'REVERSAO_INADIMPLENCIA');

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gestorId" TEXT,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "Papel" NOT NULL,
    "equipeId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "numeroPedido" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "vencimento" DATE NOT NULL,
    "pagoEm" DATE,
    "devolvidaEm" DATE,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVenda" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,

    CONSTRAINT "ItemVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaEquipe" (
    "id" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,

    CONSTRAINT "MetaEquipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoRegras" (
    "id" TEXT NOT NULL,
    "vigenciaInicio" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "regras" JSONB NOT NULL,
    "publicadaPorId" TEXT NOT NULL,
    "publicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoRegras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fechamento" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "versaoRegrasId" TEXT NOT NULL,
    "totalCentavos" INTEGER NOT NULL,
    "fechadoPorId" TEXT NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fechamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaComissao" (
    "id" TEXT NOT NULL,
    "fechamentoId" TEXT NOT NULL,
    "beneficiarioId" TEXT NOT NULL,
    "vendaId" TEXT,
    "tipo" "TipoLinha" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "memoria" JSONB NOT NULL,

    CONSTRAINT "LinhaComissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "detalhes" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_nome_key" ON "Equipe"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_gestorId_key" ON "Equipe"("gestorId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_equipeId_idx" ON "Usuario"("equipeId");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_slug_key" ON "Categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_nome_key" ON "Categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Venda_numeroPedido_key" ON "Venda"("numeroPedido");

-- CreateIndex
CREATE INDEX "Venda_vendedorId_data_idx" ON "Venda"("vendedorId", "data");

-- CreateIndex
CREATE INDEX "Venda_data_idx" ON "Venda"("data");

-- CreateIndex
CREATE INDEX "ItemVenda_vendaId_idx" ON "ItemVenda"("vendaId");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_vendedorId_competencia_key" ON "Meta"("vendedorId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "MetaEquipe_equipeId_competencia_key" ON "MetaEquipe"("equipeId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "VersaoRegras_vigenciaInicio_key" ON "VersaoRegras"("vigenciaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Fechamento_competencia_key" ON "Fechamento"("competencia");

-- CreateIndex
CREATE INDEX "LinhaComissao_beneficiarioId_idx" ON "LinhaComissao"("beneficiarioId");

-- CreateIndex
CREATE INDEX "LinhaComissao_vendaId_idx" ON "LinhaComissao"("vendaId");

-- CreateIndex
CREATE INDEX "Auditoria_criadoEm_idx" ON "Auditoria"("criadoEm");

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEquipe" ADD CONSTRAINT "MetaEquipe_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersaoRegras" ADD CONSTRAINT "VersaoRegras_publicadaPorId_fkey" FOREIGN KEY ("publicadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fechamento" ADD CONSTRAINT "Fechamento_versaoRegrasId_fkey" FOREIGN KEY ("versaoRegrasId") REFERENCES "VersaoRegras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fechamento" ADD CONSTRAINT "Fechamento_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaComissao" ADD CONSTRAINT "LinhaComissao_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "Fechamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaComissao" ADD CONSTRAINT "LinhaComissao_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaComissao" ADD CONSTRAINT "LinhaComissao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
