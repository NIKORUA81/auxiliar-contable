import { SIIGO_COMPROBANTES_HEADERS, SIIGO_FACTURAS_HEADERS } from "./headers";
import { formatDate, round2 } from "./parser";
import type { ConfigContable, DocumentoDIAN, FilaSiigo } from "./types";

export function cuentaGastoPara(nit: string, cfg: ConfigContable): string {
  const regla = cfg.reglasCuenta.find((r) => String(r.nit).trim() === String(nit).trim());
  return regla ? regla.cuenta : cfg.compras.cuentaGasto;
}

/*
 * Recibidos → filas del modelo de comprobantes contables, con partida doble:
 *   Débito  cuenta de gasto            base (total − IVA − INC)
 *   Débito  IVA descontable            IVA
 *   Débito  INC (mayor valor gasto)    INC
 *   Crédito retenciones                reteRenta / reteICA / reteIVA
 *   Crédito cuenta por pagar           total − retenciones
 * En notas crédito recibidas se invierten débitos y créditos.
 */
export function mapToComprobante(
  doc: DocumentoDIAN,
  consecutivo: number,
  cfg: ConfigContable
): FilaSiigo[] {
  const c = cfg.compras;
  const invertir = doc.clase === "nota_credito";
  const fecha = formatDate(doc.fecha, cfg.formatoFecha);
  const base = round2(doc.total - doc.iva - doc.inc);
  const retenciones = round2(doc.reteRenta + doc.reteICA + doc.reteIVA);
  const neto = round2(doc.total - retenciones);
  const tercero = doc.esRecibido ? doc.nitEmisor : doc.nitReceptor;
  const nombreTercero = doc.esRecibido ? doc.nombreEmisor : doc.nombreReceptor;
  const obs = `${doc.tipoDoc} ${doc.prefijo}${doc.folio} — ${nombreTercero} — CUFE ${doc.cufe.slice(0, 20)}…`;

  const filas: FilaSiigo[] = [];
  const fila = (
    cuenta: string,
    debito: number | "",
    credito: number | "",
    extra: FilaSiigo = {}
  ) => {
    const f: FilaSiigo = {};
    SIIGO_COMPROBANTES_HEADERS.forEach((h) => (f[h] = ""));
    f["Tipo de comprobante"] = c.tipoComprobante;
    f["Consecutivo comprobante"] = consecutivo;
    f["Fecha de elaboración "] = fecha;
    f["Sigla moneda"] = doc.divisa || "COP";
    f["Tasa de cambio"] = 1;
    f["Código cuenta contable"] = cuenta;
    f["Identificación tercero"] = tercero;
    if (c.sucursal) f["Sucursal"] = c.sucursal;
    f["Descripción"] = `${doc.tipoDoc} ${doc.prefijo}${doc.folio}`.trim();
    f["Débito"] = invertir ? credito : debito;
    f["Crédito"] = invertir ? debito : credito;
    f["Observaciones"] = obs;
    Object.assign(f, extra);
    filas.push(f);
  };

  if (base > 0) fila(cuentaGastoPara(tercero, cfg), base, "");
  if (doc.iva > 0) {
    fila(c.cuentaIVADescontable, doc.iva, "", {
      "Código impuesto": c.codigoIVA,
      "Base gravable libro compras/ventas  ": base,
    });
  }
  if (doc.inc > 0) fila(c.cuentaINC, doc.inc, "");
  if (doc.reteRenta > 0) fila(c.cuentaReteFuente, "", doc.reteRenta);
  if (doc.reteICA > 0) fila(c.cuentaReteICA, "", doc.reteICA);
  if (doc.reteIVA > 0) fila(c.cuentaReteIVA, "", doc.reteIVA);
  if (neto !== 0) {
    // SIIGO exige cuota y vencimiento en cuentas por cobrar/pagar
    fila(c.cuentaPorPagar, "", neto, { "No. cuota": 1, "Fecha vencimiento": fecha });
  }
  return filas;
}

/*
 * Emitidos (facturas) → una fila del modelo de facturas de venta.
 * El valor unitario es la BASE (total − IVA); el IVA lo agrega SIIGO con el
 * código de impuesto cargo. "Valor Forma de Pago" es el total con IVA.
 */
export function mapToFacturaVenta(
  doc: DocumentoDIAN,
  consecutivo: number,
  cfg: ConfigContable
): FilaSiigo[] {
  const v = cfg.ventas;
  const fecha = formatDate(doc.fecha, cfg.formatoFecha);
  const base = round2(doc.total - doc.iva);

  const f: FilaSiigo = {};
  SIIGO_FACTURAS_HEADERS.forEach((h) => (f[h] = ""));
  f["Tipo de comprobante"] = v.tipoComprobante;
  f["Consecutivo"] = consecutivo;
  f["Identificación tercero"] = doc.nitReceptor;
  if (v.sucursal) f["Sucursal"] = v.sucursal;
  f["Fecha de elaboración  "] = fecha;
  f["Sigla Moneda"] = doc.divisa || "COP";
  f["Tasa de cambio"] = 1;
  if (v.codigoProducto) f["Código producto"] = v.codigoProducto;
  f["Descripción producto"] = `${doc.tipoDoc} ${doc.prefijo}${doc.folio} — ${doc.nombreReceptor}`.trim();
  if (v.identificacionVendedor) f["Identificación vendedor"] = v.identificacionVendedor;
  f["Cantidad producto"] = 1;
  f["Valor unitario"] = base;
  if (doc.iva > 0) f["Código impuesto cargo"] = v.codigoIVA;
  if (v.codigoFormaPago) f["Código forma de pago"] = v.codigoFormaPago;
  f["Valor Forma de Pago"] = doc.total;
  f["Fecha Vencimiento"] = fecha;
  f["Observaciones"] = `Importado del reporte DIAN — CUFE ${doc.cufe.slice(0, 20)}…`;
  return [f];
}

/** Catálogos que SIIGO exige tener configurados antes de importar facturas de venta. */
export function validarConfigVentas(cfg: ConfigContable): string[] {
  const faltan: string[] = [];
  if (!cfg.ventas.tipoComprobante) faltan.push("Tipo de comprobante de ventas");
  if (!cfg.ventas.codigoProducto)
    faltan.push("Código de producto genérico (debe existir en el catálogo de SIIGO)");
  if (!cfg.ventas.codigoFormaPago)
    faltan.push("Código de forma de pago (obligatorio; si es crédito, SIIGO exige fecha de vencimiento)");
  return faltan;
}
