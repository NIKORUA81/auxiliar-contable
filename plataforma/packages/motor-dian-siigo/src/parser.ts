import * as XLSX from "xlsx";
import { DIAN_COLUMNS } from "./headers";
import type { ClaseDoc, DocumentoDIAN, FechaParts, RutaDoc } from "./types";

/* ============================== Utilidades ============================== */

export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** La DIAN entrega fechas "DD-MM-YYYY" (a veces con hora). */
export function parseDianDate(v: unknown): FechaParts | null {
  if (v instanceof Date) {
    return { d: v.getDate(), m: v.getMonth() + 1, y: v.getFullYear() };
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return { d: +m[1], m: +m[2], y: +m[3] };
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { d: +iso[3], m: +iso[2], y: +iso[1] };
  return null;
}

export function formatDate(parts: FechaParts | null, formato: string): string {
  if (!parts) return "";
  const dd = String(parts.d).padStart(2, "0");
  const mm = String(parts.m).padStart(2, "0");
  const yyyy = String(parts.y);
  switch (formato) {
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

export function normalizeText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/* ============================== Parser DIAN ============================== */

export function classifyTipoDoc(tipoDoc: string): ClaseDoc {
  const t = normalizeText(tipoDoc);
  if (t.includes("nomina")) return "nomina";
  if (t.includes("nota") && t.includes("credito")) return "nota_credito";
  if (t.includes("nota") && t.includes("debito")) return "nota_debito";
  if (t.includes("documento soporte")) return "doc_soporte";
  if (t.includes("pos")) return "pos";
  if (t.includes("documento equivalente")) return "doc_equivalente";
  if (t.includes("factura")) return "factura";
  return "otro";
}

/** Lee un buffer .xlsx del reporte DIAN y devuelve las filas crudas de la primera hoja. */
export function leerReporteDian(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

export function parseDianRows(sheetRows: Record<string, unknown>[]): DocumentoDIAN[] {
  const docs: DocumentoDIAN[] = [];
  for (const r of sheetRows) {
    const get = (key: string) => r[DIAN_COLUMNS[key]];
    if (get("tipoDoc") === undefined && get("total") === undefined) continue;

    const base = {
      tipoDoc: String(get("tipoDoc") ?? "").trim(),
      cufe: String(get("cufe") ?? "").trim(),
      folio: String(get("folio") ?? "").trim(),
      prefijo: String(get("prefijo") ?? "").trim(),
      divisa: String(get("divisa") ?? "COP").trim() || "COP",
      fecha: parseDianDate(get("fechaEmision")),
      nitEmisor: String(get("nitEmisor") ?? "").trim(),
      nombreEmisor: String(get("nombreEmisor") ?? "").trim(),
      nitReceptor: String(get("nitReceptor") ?? "").trim(),
      nombreReceptor: String(get("nombreReceptor") ?? "").trim(),
      iva: num(get("iva")),
      inc: num(get("inc")),
      reteIVA: num(get("reteIVA")),
      reteRenta: num(get("reteRenta")),
      reteICA: num(get("reteICA")),
      total: num(get("total")),
      estado: String(get("estado") ?? "").trim(),
      grupo: String(get("grupo") ?? "").trim(),
    };
    const clase = classifyTipoDoc(base.tipoDoc);
    docs.push({
      ...base,
      clase,
      esRecibido: normalizeText(base.grupo) === "recibido",
      esEmitido: normalizeText(base.grupo) === "emitido",
      rechazado: normalizeText(base.estado).includes("rechaz"),
    });
  }
  return docs;
}

/* ============================== Enrutamiento ============================== */

/** Decide el destino sugerido de cada documento y marca advertencias. */
export function routeDoc(doc: DocumentoDIAN): RutaDoc {
  if (doc.rechazado) {
    return { destino: "excluir", motivo: "Documento rechazado por la DIAN" };
  }
  if (doc.clase === "nomina") {
    return {
      destino: "excluir",
      motivo:
        "Nómina electrónica: se importa por el módulo de nómina de SIIGO, no por comprobantes",
    };
  }
  if (doc.esRecibido) {
    if (doc.clase === "nota_credito") {
      return {
        destino: "comprobante",
        motivo: "Nota crédito recibida: se contabiliza invirtiendo débitos y créditos",
      };
    }
    return { destino: "comprobante", motivo: "" };
  }
  if (doc.esEmitido) {
    if (doc.clase === "nota_credito" || doc.clase === "nota_debito") {
      return {
        destino: "excluir",
        motivo:
          "Las notas emitidas no van en el modelo de facturas de venta: use el modelo de notas de SIIGO o registre manualmente",
      };
    }
    if (doc.clase === "doc_soporte") {
      return {
        destino: "comprobante",
        motivo: "Documento soporte emitido a no obligado: es una compra, se contabiliza como comprobante",
      };
    }
    return { destino: "factura", motivo: "" };
  }
  return { destino: "excluir", motivo: "Grupo desconocido (ni Emitido ni Recibido)" };
}
