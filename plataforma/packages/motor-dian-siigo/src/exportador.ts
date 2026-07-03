import * as XLSX from "xlsx";
import { mapToComprobante, mapToFacturaVenta } from "./contabilizador";
import { MAX_FILAS_SIIGO, SIIGO_COMPROBANTES_HEADERS, SIIGO_FACTURAS_HEADERS } from "./headers";
import { num, round2 } from "./parser";
import type { ConfigContable, DocumentoDIAN, FilaSiigo, ResultadoExport } from "./types";

function buildXlsxBuffer(
  headers: readonly string[],
  rows: FilaSiigo[],
  sheetName: string
): Buffer {
  // aoa_to_sheet preserva los encabezados byte a byte (incluidos espacios finales)
  const aoa = [headers as string[], ...rows.map((o) => headers.map((h) => o[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Divide grupos de filas (un grupo = un comprobante completo) en archivos de
 * máximo MAX_FILAS_SIIGO filas, sin partir un comprobante entre dos archivos.
 */
export function chunkGroups(groups: FilaSiigo[][], max = MAX_FILAS_SIIGO): FilaSiigo[][] {
  const chunks: FilaSiigo[][] = [[]];
  let count = 0;
  for (const g of groups) {
    if (count + g.length > max && chunks[chunks.length - 1].length) {
      chunks.push([]);
      count = 0;
    }
    chunks[chunks.length - 1].push(...g);
    count += g.length;
  }
  return chunks.filter((c) => c.length);
}

function exportarChunks(
  groups: FilaSiigo[][],
  headers: readonly string[],
  sheetName: string,
  baseName: string
): { nombre: string; buffer: Buffer }[] {
  const chunks = chunkGroups(groups);
  const fecha = new Date().toISOString().slice(0, 10);
  return chunks.map((rows, i) => {
    const sufijo = chunks.length > 1 ? `_parte${i + 1}de${chunks.length}` : "";
    return {
      nombre: `${baseName}_${fecha}${sufijo}.xlsx`,
      buffer: buildXlsxBuffer(headers, rows, sheetName),
    };
  });
}

/** Genera los archivos SIIGO de comprobantes contables para los documentos dados. */
export function generarComprobantes(
  docs: DocumentoDIAN[],
  cfg: ConfigContable
): ResultadoExport {
  let consecutivo = cfg.compras.consecutivo;
  const grupos: FilaSiigo[][] = [];
  const descuadres: string[] = [];
  let totalFilas = 0;

  for (const doc of docs) {
    const fs = mapToComprobante(doc, consecutivo, cfg);
    const deb = round2(fs.reduce((s, f) => s + num(f["Débito"]), 0));
    const cre = round2(fs.reduce((s, f) => s + num(f["Crédito"]), 0));
    if (deb !== cre) {
      descuadres.push(`Consecutivo ${consecutivo}: débitos ${deb} ≠ créditos ${cre}`);
    }
    grupos.push(fs);
    totalFilas += fs.length;
    consecutivo++;
  }

  return {
    archivos: exportarChunks(grupos, SIIGO_COMPROBANTES_HEADERS, "Datos", "SIIGO_Comprobantes"),
    totalFilas,
    totalDocumentos: docs.length,
    proximoConsecutivo: consecutivo,
    descuadres,
  };
}

/** Genera los archivos SIIGO de facturas de venta para los documentos dados. */
export function generarFacturasVenta(
  docs: DocumentoDIAN[],
  cfg: ConfigContable
): ResultadoExport {
  let consecutivo = cfg.ventas.consecutivo;
  const grupos: FilaSiigo[][] = [];
  let totalFilas = 0;

  for (const doc of docs) {
    const fs = mapToFacturaVenta(doc, consecutivo, cfg);
    grupos.push(fs);
    totalFilas += fs.length;
    consecutivo++;
  }

  return {
    archivos: exportarChunks(grupos, SIIGO_FACTURAS_HEADERS, "Hoja1", "SIIGO_FacturasVenta"),
    totalFilas,
    totalDocumentos: docs.length,
    proximoConsecutivo: consecutivo,
    descuadres: [],
  };
}
