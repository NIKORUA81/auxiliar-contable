/*
 * Encabezados oficiales de los modelos de importación de SIIGO.
 *
 * IMPORTANTE: estos textos fueron extraídos byte a byte de los archivos
 * modelo descargados de SIIGO. Varios encabezados llevan espacios finales
 * ("Fecha de elaboración " lleva UN espacio en comprobantes y DOS en
 * facturas; "Base gravable libro compras/ventas  " lleva DOS espacios).
 * SIIGO valida el encabezado exacto: NO los edite ni los "limpie".
 */

// Modelo de importación de comprobantes contables (hoja "Datos", 27 columnas)
export const SIIGO_COMPROBANTES_HEADERS = [
  "Tipo de comprobante",
  "Consecutivo comprobante",
  "Fecha de elaboración ",
  "Sigla moneda",
  "Tasa de cambio",
  "Código cuenta contable",
  "Identificación tercero",
  "Sucursal",
  "Código producto",
  "Código de bodega",
  "Acción",
  "Cantidad producto",
  "Prefijo",
  "Consecutivo",
  "No. cuota",
  "Fecha vencimiento",
  "Código impuesto",
  "Código grupo activo fijo",
  "Código activo fijo",
  "Descripción",
  "Código centro/subcentro de costos",
  "Débito",
  "Crédito",
  "Observaciones",
  "Base gravable libro compras/ventas  ",
  "Base exenta libro compras/ventas",
  "Mes de cierre",
] as const;

// Modelo de importación de facturas de venta / ingresos (hoja "Hoja1", 31 columnas)
export const SIIGO_FACTURAS_HEADERS = [
  "Tipo de comprobante",
  "Consecutivo",
  "Identificación tercero",
  "Sucursal",
  "Código centro/subcentro de costos",
  "Fecha de elaboración  ",
  "Sigla Moneda",
  "Tasa de cambio",
  "Nombre contacto",
  "Email Contacto",
  "Orden de compra",
  "Orden de entrega",
  "Fecha orden de entrega",
  "Código producto",
  "Descripción producto",
  "Identificación vendedor",
  "Código de Bodega",
  "Cantidad producto",
  "Valor unitario",
  "Valor Descuento",
  "Base AIU",
  "Identificación ingreso para terceros",
  "Código impuesto cargo",
  "Código impuesto cargo dos",
  "Código impuesto retención",
  "Código ReteICA",
  "Código ReteIVA",
  "Código forma de pago",
  "Valor Forma de Pago",
  "Fecha Vencimiento",
  "Observaciones",
] as const;

// Columnas esperadas en el reporte de documentos electrónicos de la DIAN
export const DIAN_COLUMNS: Record<string, string> = {
  tipoDoc: "Tipo de documento",
  cufe: "CUFE/CUDE",
  folio: "Folio",
  prefijo: "Prefijo",
  divisa: "Divisa",
  formaPago: "Forma de Pago",
  medioPago: "Medio de Pago",
  fechaEmision: "Fecha Emisión",
  fechaRecepcion: "Fecha Recepción",
  nitEmisor: "NIT Emisor",
  nombreEmisor: "Nombre Emisor",
  nitReceptor: "NIT Receptor",
  nombreReceptor: "Nombre Receptor",
  iva: "IVA",
  ica: "ICA",
  ic: "IC",
  inc: "INC",
  reteIVA: "Rete IVA",
  reteRenta: "Rete Renta",
  reteICA: "Rete ICA",
  total: "Total",
  estado: "Estado",
  grupo: "Grupo",
};

/** SIIGO Nube admite máximo 500 registros por archivo de importación. */
export const MAX_FILAS_SIIGO = 500;
