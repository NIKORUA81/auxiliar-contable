# Análisis de archivos y especificación del mapeo DIAN → SIIGO

Documento de trabajo que articula los cuatro archivos analizados y define cómo la nueva
aplicación convierte el reporte DIAN en los modelos de importación de SIIGO.

## 1. Archivos analizados

### 1.1 Reporte DIAN de documentos electrónicos (`Reporte_Dian_Electronico.xlsx`)

Una sola hoja (`Rp_Doc_YYYYMMDD_HHMM`) con 32 columnas. Las relevantes para la conversión:

| Columna | Uso |
|---|---|
| `Tipo de documento` | Clasificación: Factura electrónica, Nota de crédito, Documento equivalente (POS / Servicios públicos), Documento soporte, Nómina Individual, etc. |
| `CUFE/CUDE` | Trazabilidad (se copia a Observaciones) |
| `Prefijo` + `Folio` | Referencia del documento |
| `Fecha Emisión` | Formato `DD-MM-YYYY` (con hora en `Fecha Recepción`) |
| `NIT Emisor` / `NIT Receptor` | El tercero depende del `Grupo`: en Recibidos el tercero es el emisor; en Emitidos, el receptor |
| `IVA`, `INC`, `Rete IVA`, `Rete Renta`, `Rete ICA` | Impuestos y retenciones (llegan como texto) |
| `Total` | Total del documento **con** impuestos |
| `Estado` | `Aprobado`, `Aprobado con notificación`, `Rechazado` → los rechazados se excluyen |
| `Grupo` | `Emitido` / `Recibido` → decide el modelo SIIGO destino |

Observaciones importantes:
- Los valores numéricos vienen como **texto** (`"361638.66"`) con punto decimal.
- Puede haber caracteres mal codificados en nombres (`FERRER AVENDA�O`): no usar el nombre
  como llave, siempre el NIT.
- La columna `Total` **incluye** IVA/INC; la base se obtiene restando.

### 1.2 Modelo de comprobantes contables SIIGO (27 columnas, hoja `Datos`)

Encabezados con particularidades que rompen una comparación ingenua:
- `"Fecha de elaboración "` → **un** espacio final.
- `"Base gravable libro compras/ventas  "` → **dos** espacios finales.

SIIGO valida el nombre exacto de las columnas: cualquier diferencia (incluidos espacios)
hace fallar la importación. Por eso los encabezados se mantienen como constantes extraídas
del archivo real (`js/siigo-headers.js`) y la exportación usa `XLSX.utils.aoa_to_sheet`,
que no altera las cadenas.

Además, el modelo es **por partida doble**: un documento genera varias filas con el mismo
`Consecutivo comprobante` y la suma de débitos debe igualar la de créditos.

### 1.3 Modelo de facturas de venta / ingresos SIIGO (31 columnas, hoja `Hoja1`)

- `"Fecha de elaboración  "` → **dos** espacios finales (distinto del otro modelo).
- Una fila por ítem de la factura. Como el reporte DIAN no trae detalle de ítems, se genera
  **una fila por factura** con un producto genérico configurable, cantidad 1 y
  `Valor unitario` = base (total − IVA). El IVA lo agrega SIIGO vía `Código impuesto cargo`,
  y `Valor Forma de Pago` lleva el total con IVA.
- `Código producto`, `Código forma de pago` y códigos de impuesto deben existir en el
  catálogo SIIGO de la empresa → son parte de la **preconfiguración de la pyme**.

### 1.4 Prototipo `Wolfiax_Motor_Semantico_Compatible_SIIGO.html`

Errores encontrados (corregidos en esta aplicación):

1. **Encabezados incorrectos**: usa `"Fecha de elaboración  "` (2 espacios) en comprobantes
   (el modelo real lleva 1) y `"Fecha de elaboración   "` (3 espacios) en facturas (el real
   lleva 2). El archivo generado no coincide con el modelo oficial.
2. **Comprobante descuadrado**: una única fila con `Débito = total − IVA` y `Crédito = total`.
   Nunca cuadra y no discrimina cuentas (todo a `519595`).
3. **No usa `Grupo`**: pide al usuario elegir "compra/venta" globalmente, cuando el reporte
   DIAN ya trae la clasificación por fila.
4. **No filtra** nómina, notas crédito, ni documentos rechazados.
5. **IVA duplicado en ventas**: `Valor unitario = total` (con IVA) + `Código impuesto cargo`.
6. **Fechas sin convertir** y **valores quemados** (`001`, `FP01`, `IVA19`, consecutivo manual).
7. API obsoleta `readAsBinaryString`.

## 2. Reglas de enrutamiento

| Documento del reporte DIAN | Destino |
|---|---|
| Recibido · Factura / Doc. equivalente / POS | Comprobante contable (compra/gasto) |
| Recibido · Nota crédito | Comprobante contable con débitos/créditos invertidos |
| Emitido · Factura electrónica (incl. contingencia) | Modelo de facturas de venta |
| Emitido · Documento soporte (compra a no obligado) | Comprobante contable |
| Emitido · Nota crédito/débito | **Excluido** (usar modelo de notas de SIIGO) |
| Nómina Individual | **Excluido** (módulo de nómina) |
| Estado `Rechazado` | **Excluido** |

El usuario puede anular cualquier sugerencia marcando/desmarcando la fila en la revisión.

## 3. Asiento generado por documento recibido

Con `base = Total − IVA − INC` y `retenciones = ReteRenta + ReteICA + ReteIVA`:

| Cuenta (configurable) | Débito | Crédito |
|---|---|---|
| Gasto (por defecto o regla por NIT) | base | |
| IVA descontable (`240820`) + código impuesto + base gravable | IVA | |
| INC mayor valor del gasto (`511570`) | INC | |
| ReteFuente (`236540`) | | ReteRenta |
| ReteICA (`236801`) | | ReteICA |
| ReteIVA (`236701`) | | ReteIVA |
| Cuenta por pagar (`233595`) | | Total − retenciones |

Débitos = Total = Créditos ✔. En notas crédito recibidas se invierten las columnas.
Antes de exportar, la app suma débitos y créditos de cada comprobante y reporta cualquier
descuadre (por ejemplo, por documentos con impuestos no contemplados: ICA, IBUA, ICUI…).

## 4. Preconfiguración de la pyme (persistida en `localStorage`)

- **Empresa**: NIT, razón social.
- **Compras**: tipo de comprobante, consecutivo inicial (se auto-incrementa y persiste),
  sucursal, cuentas (gasto, IVA descontable, INC, CxP, retenciones), código IVA de SIIGO.
- **Ventas**: tipo de comprobante, consecutivo, producto genérico, forma de pago, vendedor,
  código IVA.
- **Reglas por NIT**: cuenta de gasto específica por proveedor (ej. servicios públicos → `5135xx`).
- **Formato de fecha** de salida (según configuración regional de SIIGO).

## 5. Videos de referencia

Los dos videos de YouTube compartidos (`p-8Hq_ZBtDI`, `yNkGLtOJX3g`) no pudieron consultarse
desde el entorno de desarrollo (acceso a YouTube bloqueado por la política de red). El flujo
implementado se basa en el proceso estándar de SIIGO Nube: *Descargar modelo → diligenciar →
Importar datos → validar errores*. Si los videos muestran pasos o validaciones adicionales
(por ejemplo, límites de filas por importación o catálogos previos obligatorios), deben
incorporarse a este documento.

## 6. Evolución sugerida (hoja de ruta)

1. **Generar también el modelo de terceros** de SIIGO a partir de los NIT del reporte, para
   que la importación no falle por terceros inexistentes.
2. **Validaciones previas a la exportación**: NIT propio presente en cada fila del grupo
   esperado, fechas dentro del periodo, duplicados por CUFE (re-importaciones).
3. **Integración con el API de SIIGO Nube** para validar catálogos (impuestos, productos,
   formas de pago) e importar directamente sin pasar por Excel.
4. **Backend multiempresa** (cuentas de usuario, varias pymes por contador, historial de
   importaciones y de consecutivos) cuando el flujo esté validado con usuarios reales.
5. Soporte de impuestos adicionales del reporte (ICA, IBUA, ICUI, INC bolsas…) como filas
   contables configurables.
