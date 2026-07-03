import { Router } from "express";
import { z } from "zod";
import { prisma, requireAuth, requireEmpresaAccess } from "../lib/core";

const router = Router();
router.use(requireAuth);

/** Lista las empresas visibles para el usuario según su rol. */
router.get("/", async (req, res) => {
  const user = req.user!;
  const where =
    user.rol === "ADMIN"
      ? {}
      : user.rol === "CONTADOR"
        ? { contador: { usuarioId: user.id } }
        : { usuarios: { some: { usuarioId: user.id } } };

  const empresas = await prisma.empresa.findMany({
    where,
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { importJobs: true } },
    },
  });
  res.json(empresas);
});

const empresaSchema = z.object({
  nit: z.string().min(5),
  nombre: z.string().min(2),
});

/** Crea una empresa en la cartera del contador autenticado (con config por defecto). */
router.post("/", async (req, res) => {
  const user = req.user!;
  if (user.rol !== "CONTADOR" && user.rol !== "ADMIN") {
    return res.status(403).json({ error: "Solo un contador puede crear empresas" });
  }
  const parsed = empresaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const contador = await prisma.contador.findUnique({ where: { usuarioId: user.id } });
  if (!contador) return res.status(403).json({ error: "Perfil de contador no encontrado" });

  try {
    const empresa = await prisma.empresa.create({
      data: {
        ...parsed.data,
        contadorId: contador.id,
        config: { create: {} }, // valores por defecto del schema
      },
      include: { config: true },
    });
    res.status(201).json(empresa);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return res.status(409).json({ error: "Ya tienes una empresa con ese NIT" });
    }
    throw e;
  }
});

router.get("/:empresaId", requireEmpresaAccess, async (req, res) => {
  const empresa = await prisma.empresa.findUnique({
    where: { id: req.params.empresaId },
    include: { config: true, reglasCuenta: { orderBy: { nit: "asc" } } },
  });
  if (!empresa) return res.status(404).json({ error: "Empresa no encontrada" });
  res.json(empresa);
});

const configSchema = z.object({
  ccTipoComprobante: z.string(),
  ccConsecutivo: z.number().int().min(0),
  ccSucursal: z.string(),
  ccCuentaGasto: z.string().min(1),
  ccCuentaIVADescontable: z.string().min(1),
  ccCuentaINC: z.string().min(1),
  ccCuentaPorPagar: z.string().min(1),
  ccCuentaReteFuente: z.string().min(1),
  ccCuentaReteICA: z.string().min(1),
  ccCuentaReteIVA: z.string().min(1),
  ccCodigoIVA: z.string().min(1),
  fvTipoComprobante: z.string(),
  fvConsecutivo: z.number().int().min(0),
  fvSucursal: z.string(),
  fvCodigoProducto: z.string(),
  fvCodigoFormaPago: z.string(),
  fvIdentificacionVendedor: z.string(),
  fvCodigoIVA: z.string().min(1),
  formatoFecha: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
});

router.put("/:empresaId/config", requireEmpresaAccess, async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const config = await prisma.configContable.upsert({
    where: { empresaId: req.params.empresaId },
    update: parsed.data,
    create: { empresaId: req.params.empresaId, ...parsed.data },
  });
  res.json(config);
});

const reglaSchema = z.object({
  nit: z.string().min(3),
  cuenta: z.string().min(1),
  nota: z.string().default(""),
});

router.post("/:empresaId/reglas", requireEmpresaAccess, async (req, res) => {
  const parsed = reglaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const regla = await prisma.reglaCuenta.upsert({
    where: { empresaId_nit: { empresaId: req.params.empresaId, nit: parsed.data.nit } },
    update: { cuenta: parsed.data.cuenta, nota: parsed.data.nota },
    create: { empresaId: req.params.empresaId, ...parsed.data },
  });
  res.status(201).json(regla);
});

router.delete("/:empresaId/reglas/:reglaId", requireEmpresaAccess, async (req, res) => {
  await prisma.reglaCuenta.deleteMany({
    where: { id: req.params.reglaId, empresaId: req.params.empresaId },
  });
  res.status(204).end();
});

export default router;
