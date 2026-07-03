import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const prisma = new PrismaClient();

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  // Falla temprano y explícito: nunca arrancar con secreto vacío.
  throw new Error("JWT_SECRET no está definido en las variables de entorno");
}

export interface AuthUser {
  id: string;
  rol: "ADMIN" | "CONTADOR" | "EMPRESA";
  nombre: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function firmarToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Middleware: exige JWT válido y adjunta req.user. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

/**
 * Middleware: valida que el usuario tenga acceso a la empresa de req.params.empresaId.
 * - ADMIN: acceso total.
 * - CONTADOR: solo empresas de su cartera.
 * - EMPRESA: solo empresas vinculadas vía EmpresaUsuario.
 */
export async function requireEmpresaAccess(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  const empresaId = req.params.empresaId;
  if (!empresaId) return res.status(400).json({ error: "empresaId requerido" });
  if (user.rol === "ADMIN") return next();

  const acceso =
    user.rol === "CONTADOR"
      ? await prisma.empresa.findFirst({
          where: { id: empresaId, contador: { usuarioId: user.id } },
          select: { id: true },
        })
      : await prisma.empresaUsuario.findFirst({
          where: { empresaId, usuarioId: user.id },
          select: { id: true },
        });

  if (!acceso) return res.status(403).json({ error: "Sin acceso a esta empresa" });
  next();
}

/** Convierte el registro ConfigContable + reglas al formato del motor. */
export function toMotorConfig(
  cfg: {
    ccTipoComprobante: string;
    ccConsecutivo: number;
    ccSucursal: string;
    ccCuentaGasto: string;
    ccCuentaIVADescontable: string;
    ccCuentaINC: string;
    ccCuentaPorPagar: string;
    ccCuentaReteFuente: string;
    ccCuentaReteICA: string;
    ccCuentaReteIVA: string;
    ccCodigoIVA: string;
    fvTipoComprobante: string;
    fvConsecutivo: number;
    fvSucursal: string;
    fvCodigoProducto: string;
    fvCodigoFormaPago: string;
    fvIdentificacionVendedor: string;
    fvCodigoIVA: string;
    formatoFecha: string;
  },
  reglas: { nit: string; cuenta: string; nota: string }[]
) {
  return {
    compras: {
      tipoComprobante: cfg.ccTipoComprobante,
      consecutivo: cfg.ccConsecutivo,
      sucursal: cfg.ccSucursal,
      cuentaGasto: cfg.ccCuentaGasto,
      cuentaIVADescontable: cfg.ccCuentaIVADescontable,
      cuentaINC: cfg.ccCuentaINC,
      cuentaPorPagar: cfg.ccCuentaPorPagar,
      cuentaReteFuente: cfg.ccCuentaReteFuente,
      cuentaReteICA: cfg.ccCuentaReteICA,
      cuentaReteIVA: cfg.ccCuentaReteIVA,
      codigoIVA: cfg.ccCodigoIVA,
    },
    ventas: {
      tipoComprobante: cfg.fvTipoComprobante,
      consecutivo: cfg.fvConsecutivo,
      sucursal: cfg.fvSucursal,
      codigoProducto: cfg.fvCodigoProducto,
      codigoFormaPago: cfg.fvCodigoFormaPago,
      identificacionVendedor: cfg.fvIdentificacionVendedor,
      codigoIVA: cfg.fvCodigoIVA,
    },
    formatoFecha: cfg.formatoFecha,
    reglasCuenta: reglas,
  };
}
