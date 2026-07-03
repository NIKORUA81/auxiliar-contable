import {
  generarComprobantes,
  generarFacturasVenta,
  leerReporteDian,
  parseDianRows,
  routeDoc,
  validarConfigVentas,
  type DocumentoDIAN,
} from "@auxiliar/motor-dian-siigo";
import AdmZip from "adm-zip";
import { Router } from "express";
import multer from "multer";
import { prisma, requireAuth, requireEmpresaAccess, toMotorConfig } from "../lib/core";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const router = Router();
router.use(requireAuth);

/** Sube el reporte DIAN (.xlsx), lo parsea, enruta cada documento y crea el job. */
router.post(
  "/empresas/:empresaId/importaciones",
  requireEmpresaAccess,
  upload.single("archivo"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Adjunte el reporte .xlsx de la DIAN" });

    let docs: DocumentoDIAN[];
    try {
      const rows = leerReporteDian(req.file.buffer);
      docs = parseDianRows(rows);
    } catch {
      return res.status(400).json({ error: "No fue posible leer el archivo. ¿Es un .xlsx válido?" });
    }
    if (!docs.length) {
      return res.status(400).json({
        error:
          "No se encontraron documentos. Verifique que el archivo sea el reporte de documentos electrónicos de la DIAN.",
      });
    }

    const job = await prisma.importJob.create({
      data: {
        empresaId: req.params.empresaId,
        archivoOrigen: req.file.originalname,
        estado: "LISTO",
        totalDocs: docs.length,
        documentos: {
          create: docs.map((doc) => {
            const ruta = routeDoc(doc);
            return {
              cufe: doc.cufe,
              tipoDoc: doc.tipoDoc,
              destino: ruta.destino,
              motivo: ruta.motivo,
              incluir: ruta.destino !== "excluir",
              datosJson: doc as object,
            };
          }),
        },
      },
    });

    res.status(201).json({ id: job.id, totalDocs: job.totalDocs });
  }
);

/** Lista los jobs de una empresa. */
router.get("/empresas/:empresaId/importaciones", requireEmpresaAccess, async (req, res) => {
  const jobs = await prisma.importJob.findMany({
    where: { empresaId: req.params.empresaId },
    orderBy: { creadoEn: "desc" },
    select: { id: true, archivoOrigen: true, estado: true, totalDocs: true, creadoEn: true },
  });
  res.json(jobs);
});

/** Middleware local: carga el job y valida acceso a su empresa. */
async function cargarJob(req: any, res: any, next: any) {
  const job = await prisma.importJob.findUnique({
    where: { id: req.params.jobId },
    include: {
      empresa: { include: { config: true, reglasCuenta: true, contador: true } },
    },
  });
  if (!job) return res.status(404).json({ error: "Importación no encontrada" });
  const user = req.user!;
  if (user.rol !== "ADMIN") {
    const ok =
      user.rol === "CONTADOR"
        ? job.empresa.contador.usuarioId === user.id
        : await prisma.empresaUsuario.findFirst({
            where: { empresaId: job.empresaId, usuarioId: user.id },
          });
    if (!ok) return res.status(403).json({ error: "Sin acceso a esta importación" });
  }
  req.job = job;
  next();
}

/** Detalle del job con sus documentos para la pantalla de revisión. */
router.get("/importaciones/:jobId", cargarJob, async (req: any, res) => {
  const documentos = await prisma.documentoImportado.findMany({
    where: { jobId: req.job.id },
    orderBy: { id: "asc" },
  });
  res.json({
    id: req.job.id,
    empresaId: req.job.empresaId,
    archivoOrigen: req.job.archivoOrigen,
    totalDocs: req.job.totalDocs,
    creadoEn: req.job.creadoEn,
    documentos,
  });
});

/** Cambia incluir/destino de un documento durante la revisión. */
router.patch("/importaciones/:jobId/documentos/:docId", cargarJob, async (req: any, res) => {
  const { incluir, destino } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (typeof incluir === "boolean") data.incluir = incluir;
  if (destino === "comprobante" || destino === "factura" || destino === "excluir") {
    data.destino = destino;
  }
  if (!Object.keys(data).length) return res.status(400).json({ error: "Nada que actualizar" });

  const doc = await prisma.documentoImportado.updateMany({
    where: { id: req.params.docId, jobId: req.job.id },
    data,
  });
  if (!doc.count) return res.status(404).json({ error: "Documento no encontrado" });
  res.json({ ok: true });
});

/**
 * Exporta los archivos SIIGO del job (tipo = comprobantes | facturas).
 * Devuelve siempre un .zip con los .xlsx generados (respetando el tope de
 * 500 filas por archivo). El consecutivo se actualiza en una transacción.
 */
router.post("/importaciones/:jobId/exportar/:tipo", cargarJob, async (req: any, res) => {
  const tipo = req.params.tipo as "comprobantes" | "facturas";
  if (tipo !== "comprobantes" && tipo !== "facturas") {
    return res.status(400).json({ error: "Tipo de exportación inválido" });
  }
  const cfgRow = req.job.empresa.config;
  if (!cfgRow) return res.status(400).json({ error: "Configure la empresa antes de exportar" });

  const destino = tipo === "comprobantes" ? "comprobante" : "factura";
  const registros = await prisma.documentoImportado.findMany({
    where: { jobId: req.job.id, incluir: true, destino },
    orderBy: { id: "asc" },
  });
  if (!registros.length) {
    return res.status(400).json({ error: `No hay documentos marcados con destino ${destino}` });
  }

  const cfg = toMotorConfig(cfgRow, req.job.empresa.reglasCuenta);
  const docs = registros.map((r: { datosJson: unknown }) => r.datosJson as DocumentoDIAN);

  if (tipo === "facturas") {
    const faltan = validarConfigVentas(cfg);
    if (faltan.length && req.query.forzar !== "1") {
      return res.status(422).json({
        error: "Faltan datos de configuración que SIIGO exige para importar facturas",
        faltan,
      });
    }
  }

  const resultado =
    tipo === "comprobantes" ? generarComprobantes(docs, cfg) : generarFacturasVenta(docs, cfg);

  // Actualiza el consecutivo de forma atómica para evitar colisiones
  await prisma.configContable.update({
    where: { empresaId: req.job.empresaId },
    data:
      tipo === "comprobantes"
        ? { ccConsecutivo: resultado.proximoConsecutivo }
        : { fvConsecutivo: resultado.proximoConsecutivo },
  });

  const zip = new AdmZip();
  for (const a of resultado.archivos) zip.addFile(a.nombre, a.buffer);
  zip.addFile(
    "RESUMEN.txt",
    Buffer.from(
      [
        `Exportación: ${tipo}`,
        `Documentos: ${resultado.totalDocumentos}`,
        `Filas: ${resultado.totalFilas}`,
        `Archivos: ${resultado.archivos.length} (máx. 500 registros c/u)`,
        `Próximo consecutivo: ${resultado.proximoConsecutivo}`,
        resultado.descuadres.length
          ? `\n⚠ DESCUADRES (SIIGO los rechazará):\n${resultado.descuadres.join("\n")}`
          : "\n✔ Todos los comprobantes cumplen partida doble (débitos = créditos).",
      ].join("\n"),
      "utf-8"
    )
  );

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="SIIGO_${tipo}_${new Date().toISOString().slice(0, 10)}.zip"`
  );
  res.send(zip.toBuffer());
});

export default router;
