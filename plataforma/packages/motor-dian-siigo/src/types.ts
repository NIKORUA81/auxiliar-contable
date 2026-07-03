/** Documento leído del reporte de documentos electrónicos de la DIAN. */
export interface DocumentoDIAN {
  tipoDoc: string;
  cufe: string;
  folio: string;
  prefijo: string;
  divisa: string;
  fecha: FechaParts | null;
  nitEmisor: string;
  nombreEmisor: string;
  nitReceptor: string;
  nombreReceptor: string;
  iva: number;
  inc: number;
  reteIVA: number;
  reteRenta: number;
  reteICA: number;
  total: number;
  estado: string;
  grupo: string;
  clase: ClaseDoc;
  esRecibido: boolean;
  esEmitido: boolean;
  rechazado: boolean;
}

export interface FechaParts {
  d: number;
  m: number;
  y: number;
}

export type ClaseDoc =
  | "factura"
  | "nota_credito"
  | "nota_debito"
  | "doc_soporte"
  | "doc_equivalente"
  | "pos"
  | "nomina"
  | "otro";

export type Destino = "comprobante" | "factura" | "excluir";

export interface RutaDoc {
  destino: Destino;
  motivo: string;
}

export interface ReglaCuenta {
  nit: string;
  cuenta: string;
  nota?: string;
}

export interface ConfigCompras {
  tipoComprobante: string;
  consecutivo: number;
  sucursal: string;
  cuentaGasto: string;
  cuentaIVADescontable: string;
  cuentaINC: string;
  cuentaPorPagar: string;
  cuentaReteFuente: string;
  cuentaReteICA: string;
  cuentaReteIVA: string;
  codigoIVA: string;
}

export interface ConfigVentas {
  tipoComprobante: string;
  consecutivo: number;
  sucursal: string;
  codigoProducto: string;
  codigoFormaPago: string;
  identificacionVendedor: string;
  codigoIVA: string;
}

export interface ConfigContable {
  compras: ConfigCompras;
  ventas: ConfigVentas;
  formatoFecha: string;
  reglasCuenta: ReglaCuenta[];
}

/** Fila de un modelo SIIGO: mapa encabezado exacto → valor. */
export type FilaSiigo = Record<string, string | number>;

export interface ResultadoExport {
  archivos: { nombre: string; buffer: Buffer }[];
  totalFilas: number;
  totalDocumentos: number;
  proximoConsecutivo: number;
  descuadres: string[];
}
