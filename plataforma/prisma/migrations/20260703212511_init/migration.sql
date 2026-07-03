-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'CONTADOR', 'EMPRESA');

-- CreateEnum
CREATE TYPE "EstadoJob" AS ENUM ('PROCESANDO', 'LISTO', 'ERROR');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contadores" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "contadores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contadorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresa_usuarios" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "empresa_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configs_contables" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ccTipoComprobante" TEXT NOT NULL DEFAULT 'CC',
    "ccConsecutivo" INTEGER NOT NULL DEFAULT 1000,
    "ccSucursal" TEXT NOT NULL DEFAULT '',
    "ccCuentaGasto" TEXT NOT NULL DEFAULT '519595',
    "ccCuentaIVADescontable" TEXT NOT NULL DEFAULT '240820',
    "ccCuentaINC" TEXT NOT NULL DEFAULT '511570',
    "ccCuentaPorPagar" TEXT NOT NULL DEFAULT '233595',
    "ccCuentaReteFuente" TEXT NOT NULL DEFAULT '236540',
    "ccCuentaReteICA" TEXT NOT NULL DEFAULT '236801',
    "ccCuentaReteIVA" TEXT NOT NULL DEFAULT '236701',
    "ccCodigoIVA" TEXT NOT NULL DEFAULT 'IVA19',
    "fvTipoComprobante" TEXT NOT NULL DEFAULT 'FV',
    "fvConsecutivo" INTEGER NOT NULL DEFAULT 1,
    "fvSucursal" TEXT NOT NULL DEFAULT '',
    "fvCodigoProducto" TEXT NOT NULL DEFAULT '',
    "fvCodigoFormaPago" TEXT NOT NULL DEFAULT '',
    "fvIdentificacionVendedor" TEXT NOT NULL DEFAULT '',
    "fvCodigoIVA" TEXT NOT NULL DEFAULT 'IVA19',
    "formatoFecha" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',

    CONSTRAINT "configs_contables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglas_cuenta" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "nota" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "reglas_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "archivoOrigen" TEXT NOT NULL,
    "estado" "EstadoJob" NOT NULL DEFAULT 'PROCESANDO',
    "totalDocs" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_importados" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cufe" TEXT NOT NULL,
    "tipoDoc" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "motivo" TEXT NOT NULL DEFAULT '',
    "incluir" BOOLEAN NOT NULL DEFAULT true,
    "datosJson" JSONB NOT NULL,

    CONSTRAINT "documentos_importados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contadores_usuarioId_key" ON "contadores"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "empresas_contadorId_nit_key" ON "empresas"("contadorId", "nit");

-- CreateIndex
CREATE UNIQUE INDEX "empresa_usuarios_usuarioId_empresaId_key" ON "empresa_usuarios"("usuarioId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "configs_contables_empresaId_key" ON "configs_contables"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "reglas_cuenta_empresaId_nit_key" ON "reglas_cuenta"("empresaId", "nit");

-- CreateIndex
CREATE INDEX "import_jobs_empresaId_creadoEn_idx" ON "import_jobs"("empresaId", "creadoEn");

-- CreateIndex
CREATE INDEX "documentos_importados_jobId_idx" ON "documentos_importados"("jobId");

-- AddForeignKey
ALTER TABLE "contadores" ADD CONSTRAINT "contadores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_contadorId_fkey" FOREIGN KEY ("contadorId") REFERENCES "contadores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_usuarios" ADD CONSTRAINT "empresa_usuarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empresa_usuarios" ADD CONSTRAINT "empresa_usuarios_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configs_contables" ADD CONSTRAINT "configs_contables_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_cuenta" ADD CONSTRAINT "reglas_cuenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_importados" ADD CONSTRAINT "documentos_importados_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
