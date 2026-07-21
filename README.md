# Auxiliar Contable — DIAN → SIIGO

Aplicación web (prototipo) que convierte el **reporte de documentos electrónicos de la DIAN**
(Emitidos y Recibidos, formato `.xlsx`) en los **archivos modelo oficiales de importación de SIIGO**:

- *Modelo de importación de comprobantes contables* (compras/gastos — documentos **recibidos**)
- *Modelo de importación de facturas de venta / ingresos* (ventas — documentos **emitidos**)

Todo el procesamiento ocurre **en el navegador** (SheetJS): ningún dato contable sale del equipo
del usuario, lo cual es importante porque el reporte DIAN contiene información tributaria sensible.

## Estructura del repositorio

```
auxiliar-contable/
├── index.html, js/, css/       Prototipo estático original (100% en el navegador)
├── dist/AuxiliarContable.html   Versión de archivo único, sin internet
├── plataforma/                  ★ Aplicación completa (multi-empresa, con base de datos)
│   ├── apps/api/                Backend Express + TypeScript + Prisma (PostgreSQL)
│   ├── apps/web/                Frontend React + Vite (tema claro/oscuro, responsive)
│   ├── packages/motor-dian-siigo/  Motor compartido de parseo y contabilización
│   ├── prisma/                  Esquema de base de datos
│   ├── docker-compose.yml       db + api + web para el VPS
│   └── preview/                 Vista previa estática de las 4 pantallas (sin backend)
└── descargador-dian/            Módulo local: descarga PDF de la DIAN por CUFE (Python + Flask)
```

- **Prototipo estático** (raíz): sigue funcionando igual, ideal para uso individual sin cuenta.
- **Plataforma** (`plataforma/`): versión completa con login, roles (contador/empresa/admin),
  configuración por empresa persistida en PostgreSQL e historial de importaciones.
  Guía de despliegue en [`plataforma/README.md`](plataforma/README.md).
- **Vista previa** (`plataforma/preview/`): abre `index.html` para ver la forma de las
  4 pantallas con datos simulados, sin instalar nada.
- **Descargador DIAN** (`descargador-dian/`): a partir de una lista de llaves CUFE/CUDE en
  Excel, descarga en lote los PDF de los documentos electrónicos desde el portal de la DIAN.
  Interfaz web local (Flask) + navegador automatizado (Playwright).
  Instrucciones en [`descargador-dian/README.md`](descargador-dian/README.md).

El motor de negocio (`packages/motor-dian-siigo`) es un puerto a TypeScript del mismo
`js/app.js` del prototipo estático: mismos encabezados, misma partida doble, mismo
límite de 500 filas por archivo — validado primero en el prototipo y luego portado.

## Cómo ejecutar el prototipo estático

Tres opciones, de la más simple a la más permanente:

1. **Enlace directo (sin instalar nada)**:
   <https://raw.githack.com/NIKORUA81/auxiliar-contable/claude/dian-siigo-import-app-lquv5j/index.html>
2. **Archivo único local**: descargue [`dist/AuxiliarContable.html`](dist/AuxiliarContable.html)
   y ábralo con doble clic — funciona sin internet (toda la app va incluida en un solo archivo).
3. **GitHub Pages (enlace permanente)**: en GitHub vaya a **Settings → Pages → Source →
   "GitHub Actions"** (un solo clic, una sola vez). El workflow `pages.yml` ya está en el
   repo; en el siguiente push (o ejecutándolo desde la pestaña Actions) la app quedará
   publicada en <https://nikorua81.github.io/auxiliar-contable/>.

## Cómo usarla

1. Abra la aplicación con cualquiera de las opciones anteriores.
2. **Paso 1 — Configuración de la pyme**: NIT, tipos de comprobante, consecutivos iniciales,
   plan de cuentas (gasto, IVA descontable, CxP, retenciones), códigos de impuesto de SIIGO y
   reglas de cuenta por NIT de proveedor. Se guarda en `localStorage` y se reutiliza.
3. **Paso 2 — Importar**: suba el `.xlsx` descargado de la DIAN.
4. **Paso 3 — Revisión**: la app clasifica cada documento (comprobante / factura de venta /
   excluido) usando la columna `Grupo` y el tipo de documento, y explica el motivo. Puede
   incluir o excluir filas manualmente.
5. **Paso 4 — Exportar**: descarga los `.xlsx` con los encabezados oficiales de SIIGO,
   listos para importar en la plataforma. Los consecutivos usados se persisten para la
   próxima sesión.

Hay un reporte DIAN **de ejemplo con datos ficticios** en `samples/Reporte_Dian_Ejemplo.xlsx`
para probar el flujo completo.

## Qué corrige frente al prototipo anterior (Wolfiax)

El análisis detallado está en [`docs/analisis.md`](docs/analisis.md). Resumen:

| # | Problema del prototipo | Solución en esta app |
|---|---|---|
| 1 | Encabezados con espacios finales que **no coinciden** con los modelos reales de SIIGO (`Fecha de elaboración`) — SIIGO rechaza el archivo | Encabezados extraídos byte a byte de los modelos oficiales (`js/siigo-headers.js`) y exportación con `aoa_to_sheet` que los preserva |
| 2 | Comprobantes **descuadrados**: una sola fila con Débito ≠ Crédito (viola partida doble) | Motor contable que genera varias filas por documento (gasto, IVA descontable, INC, retenciones, CxP) y **verifica débitos = créditos** antes de exportar |
| 3 | Ignoraba la columna `Grupo` (Emitido/Recibido) del reporte DIAN | Enrutamiento automático: Recibidos → comprobantes; Emitidos → facturas de venta |
| 4 | No filtraba Nómina Individual, notas crédito emitidas ni documentos `Rechazado` | Clasificador por tipo de documento y estado, con motivo visible y exclusión sugerida |
| 5 | En ventas ponía `Valor unitario` = total **con IVA** y además código de impuesto → IVA duplicado | `Valor unitario` = base (total − IVA); el IVA lo calcula SIIGO con el código de impuesto cargo |
| 6 | Fechas DIAN (`DD-MM-YYYY`) pasaban sin convertir | Conversión de fecha con formato de salida configurable |
| 7 | Sin preconfiguración de la pyme; valores quemados en el código (`519595`, `001`, `FP01`) | Configuración persistente por empresa + reglas de cuenta por NIT |
| 8 | `readAsBinaryString` (API obsoleta) | `readAsArrayBuffer` |

## Estructura del proyecto

```
index.html            Interfaz (4 pasos: configurar, importar, revisar, exportar)
css/styles.css        Estilos
js/siigo-headers.js   Encabezados oficiales de SIIGO y columnas del reporte DIAN
js/app.js             Configuración, parser DIAN, motor contable y exportador
docs/analisis.md      Análisis de los archivos y especificación del mapeo
docs/modelos/         Modelos oficiales de SIIGO usados como referencia
samples/              Reporte DIAN de ejemplo (datos ficticios)
```

## Despliegue en VPS propio

Dos guías según qué quiera publicar:

- **Solo el prototipo estático** (subdominio + SSL, sin base de datos):
  [`docs/DEPLOY.md`](docs/DEPLOY.md).
- **La plataforma completa** (login, multiempresa, PostgreSQL, Docker Compose, en un
  segundo subdominio en paralelo): [`docs/DEPLOY_PLATAFORMA.md`](docs/DEPLOY_PLATAFORMA.md)
  — esta es la que reemplaza el esquema preparatorio [`sql/schema.sql`](sql/schema.sql)
  (ya implementado y gestionado con migraciones de Prisma en
  `plataforma/prisma/schema.prisma`).

## Reglas de SIIGO Nube incorporadas (tutoriales oficiales)

- **Máximo 500 registros por archivo de importación**: la exportación se divide
  automáticamente en varios archivos sin partir comprobantes.
- **Partida doble obligatoria** en comprobantes: la app la garantiza y la verifica.
- **Cuentas por cobrar/pagar** llevan `No. cuota` y `Fecha vencimiento`.
- **Forma de pago obligatoria** en facturas de venta (con vencimiento si es crédito):
  se valida la configuración antes de exportar.
- **Catálogos previos**: tipos de comprobante, terceros, productos, impuestos, formas de
  pago, centros de costo, vendedores y bodegas deben existir en SIIGO; la app muestra la
  lista de verificación en el paso 4.
- **No se modifican títulos ni columnas** de los modelos oficiales.

## Limitaciones del prototipo (siguiente iteración)

- Los códigos de impuesto/producto/forma de pago deben existir previamente en el catálogo
  de SIIGO del usuario; la app no los valida contra SIIGO (requeriría el API de SIIGO Nube).
- Las **notas crédito emitidas** se excluyen (el modelo de facturas de venta no las admite);
  deben registrarse con el modelo de notas de SIIGO o manualmente.
- La **nómina electrónica** se excluye siempre (se importa por el módulo de nómina).
- Los terceros deben existir en SIIGO; una siguiente versión podría generar también el
  modelo de importación de terceros a partir de los NIT/nombres del reporte.
- ~~Falta backend multiusuario~~ → implementado en [`plataforma/`](plataforma/README.md)
  (cuentas, varias empresas por contador, historial de importaciones en PostgreSQL). El
  prototipo estático de la raíz se mantiene aparte para uso individual sin cuenta.

> **Nota**: los archivos generados deben revisarse con el contador antes de importarlos a SIIGO.
