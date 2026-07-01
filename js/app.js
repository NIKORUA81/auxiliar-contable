/*
 * Auxiliar Contable — DIAN → SIIGO
 *
 * Flujo: 1) configurar la pyme, 2) importar el reporte .xlsx de documentos
 * electrónicos de la DIAN, 3) revisar/clasificar los documentos y
 * 4) exportar los archivos modelo de SIIGO ya diligenciados.
 *
 * Todo se ejecuta en el navegador: ningún dato contable sale del equipo.
 */

/* ============================== Configuración ============================== */

const CONFIG_KEY = "auxiliar-contable:config";

const DEFAULT_CONFIG = {
  empresa: { nit: "", nombre: "" },
  compras: {
    tipoComprobante: "CC",
    consecutivo: 1000,
    sucursal: "",
    cuentaGasto: "519595",
    cuentaIVADescontable: "240820",
    cuentaINC: "511570",
    cuentaPorPagar: "233595",
    cuentaReteFuente: "236540",
    cuentaReteICA: "236801",
    cuentaReteIVA: "236701",
    codigoIVA: "IVA19"
  },
  ventas: {
    tipoComprobante: "FV",
    consecutivo: 1,
    sucursal: "",
    codigoProducto: "",
    codigoFormaPago: "",
    identificacionVendedor: "",
    codigoIVA: "IVA19"
  },
  formatoFecha: "DD/MM/YYYY",
  // Reglas para asignar cuenta de gasto según el NIT del proveedor
  reglasCuenta: [] // { nit, cuenta, nota }
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return structuredClone(DEFAULT_CONFIG);
    const cfg = JSON.parse(raw);
    // mezcla superficial por sección para tolerar configs de versiones previas
    const merged = structuredClone(DEFAULT_CONFIG);
    for (const k of Object.keys(merged)) {
      if (cfg[k] !== undefined) {
        merged[k] = typeof merged[k] === "object" && !Array.isArray(merged[k])
          ? { ...merged[k], ...cfg[k] }
          : cfg[k];
      }
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_CONFIG);
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

/* ============================== Utilidades ============================== */

function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// DIAN entrega fechas "DD-MM-YYYY" (a veces con hora). Devuelve {d,m,y} o null.
function parseDianDate(v) {
  if (v instanceof Date) {
    return { d: v.getDate(), m: v.getMonth() + 1, y: v.getFullYear() };
  }
  const s = String(v || "").trim();
  const m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return { d: +m[1], m: +m[2], y: +m[3] };
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { d: +iso[3], m: +iso[2], y: +iso[1] };
  return null;
}

function formatDate(parts, formato) {
  if (!parts) return "";
  const dd = String(parts.d).padStart(2, "0");
  const mm = String(parts.m).padStart(2, "0");
  const yyyy = String(parts.y);
  switch (formato) {
    case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
    case "MM/DD/YYYY": return `${mm}/${dd}/${yyyy}`;
    default: return `${dd}/${mm}/${yyyy}`;
  }
}

function normalizeText(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim();
}

/* ============================== Parser DIAN ============================== */

function readWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        resolve(XLSX.read(e.target.result, { type: "array", cellDates: false }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// Clasificación del tipo de documento DIAN
function classifyTipoDoc(tipoDoc) {
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

function parseDianRows(sheetRows) {
  const docs = [];
  for (const r of sheetRows) {
    const get = key => r[DIAN_COLUMNS[key]];
    if (get("tipoDoc") === undefined && get("total") === undefined) continue;

    const doc = {
      tipoDoc: String(get("tipoDoc") || "").trim(),
      cufe: String(get("cufe") || "").trim(),
      folio: String(get("folio") || "").trim(),
      prefijo: String(get("prefijo") || "").trim(),
      divisa: String(get("divisa") || "COP").trim() || "COP",
      fecha: parseDianDate(get("fechaEmision")),
      nitEmisor: String(get("nitEmisor") || "").trim(),
      nombreEmisor: String(get("nombreEmisor") || "").trim(),
      nitReceptor: String(get("nitReceptor") || "").trim(),
      nombreReceptor: String(get("nombreReceptor") || "").trim(),
      iva: num(get("iva")),
      inc: num(get("inc")),
      reteIVA: num(get("reteIVA")),
      reteRenta: num(get("reteRenta")),
      reteICA: num(get("reteICA")),
      total: num(get("total")),
      estado: String(get("estado") || "").trim(),
      grupo: String(get("grupo") || "").trim()
    };
    doc.clase = classifyTipoDoc(doc.tipoDoc);
    doc.esRecibido = normalizeText(doc.grupo) === "recibido";
    doc.esEmitido = normalizeText(doc.grupo) === "emitido";
    doc.rechazado = normalizeText(doc.estado).includes("rechaz");
    docs.push(doc);
  }
  return docs;
}

// Decide el destino sugerido de cada documento y marca advertencias
function routeDoc(doc) {
  if (doc.rechazado) return { destino: "excluir", motivo: "Documento rechazado por la DIAN" };
  if (doc.clase === "nomina") return { destino: "excluir", motivo: "Nómina electrónica: se importa por el módulo de nómina de SIIGO, no por comprobantes" };
  if (doc.esRecibido) {
    if (doc.clase === "nota_credito") return { destino: "comprobante", motivo: "Nota crédito recibida: se contabiliza invirtiendo débitos y créditos" };
    return { destino: "comprobante", motivo: "" };
  }
  if (doc.esEmitido) {
    if (doc.clase === "nota_credito" || doc.clase === "nota_debito") {
      return { destino: "excluir", motivo: "Las notas emitidas no van en el modelo de facturas de venta: use el modelo de notas de SIIGO o registre manualmente" };
    }
    if (doc.clase === "doc_soporte") {
      return { destino: "comprobante", motivo: "Documento soporte emitido a no obligado: es una compra, se contabiliza como comprobante" };
    }
    return { destino: "factura", motivo: "" };
  }
  return { destino: "excluir", motivo: "Grupo desconocido (ni Emitido ni Recibido)" };
}

/* ============================== Motor contable ============================== */

function cuentaGastoPara(nit, cfg) {
  const regla = cfg.reglasCuenta.find(r => String(r.nit).trim() === String(nit).trim());
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
function mapToComprobante(doc, consecutivo, cfg) {
  const c = cfg.compras;
  const invertir = doc.clase === "nota_credito";
  const fecha = formatDate(doc.fecha, cfg.formatoFecha);
  const base = round2(doc.total - doc.iva - doc.inc);
  const retenciones = round2(doc.reteRenta + doc.reteICA + doc.reteIVA);
  const neto = round2(doc.total - retenciones);
  const tercero = doc.esRecibido ? doc.nitEmisor : doc.nitReceptor;
  const nombreTercero = doc.esRecibido ? doc.nombreEmisor : doc.nombreReceptor;
  const obs = `${doc.tipoDoc} ${doc.prefijo}${doc.folio} — ${nombreTercero} — CUFE ${doc.cufe.slice(0, 20)}…`;

  const filas = [];
  const fila = (cuenta, debito, credito, extra = {}) => {
    const f = {};
    SIIGO_COMPROBANTES_HEADERS.forEach(h => (f[h] = ""));
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
      "Base gravable libro compras/ventas  ": base
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
function mapToFacturaVenta(doc, consecutivo, cfg) {
  const v = cfg.ventas;
  const fecha = formatDate(doc.fecha, cfg.formatoFecha);
  const base = round2(doc.total - doc.iva);

  const f = {};
  SIIGO_FACTURAS_HEADERS.forEach(h => (f[h] = ""));
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

/* ============================== Exportador ============================== */

// SIIGO Nube admite máximo 500 registros por archivo de importación
const MAX_FILAS_SIIGO = 500;

function exportXlsx(headers, rowsObjs, sheetName, fileName) {
  // aoa_to_sheet preserva los encabezados byte a byte (incluidos espacios finales)
  const aoa = [headers, ...rowsObjs.map(o => headers.map(h => o[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

/*
 * Divide grupos de filas (un grupo = un comprobante completo) en archivos de
 * máximo MAX_FILAS_SIIGO filas, sin partir un comprobante entre dos archivos.
 */
function chunkGroups(groups, max = MAX_FILAS_SIIGO) {
  const chunks = [[]];
  let count = 0;
  for (const g of groups) {
    if (count + g.length > max && chunks[chunks.length - 1].length) {
      chunks.push([]);
      count = 0;
    }
    chunks[chunks.length - 1].push(...g);
    count += g.length;
  }
  return chunks.filter(c => c.length);
}

function exportChunks(groups, headers, sheetName, baseName) {
  const chunks = chunkGroups(groups);
  const fecha = new Date().toISOString().slice(0, 10);
  chunks.forEach((rows, i) => {
    const sufijo = chunks.length > 1 ? `_parte${i + 1}de${chunks.length}` : "";
    exportXlsx(headers, rows, sheetName, `${baseName}_${fecha}${sufijo}.xlsx`);
  });
  return chunks.length;
}

/* ============================== Estado de la UI ============================== */

let config = loadConfig();
let documentos = []; // [{doc, destino, motivo, incluir}]

const $ = id => document.getElementById(id);

/* ---------- Configuración ---------- */

const CONFIG_FIELDS = [
  ["cfg-nit", c => c.empresa, "nit"],
  ["cfg-nombre", c => c.empresa, "nombre"],
  ["cfg-cc-tipo", c => c.compras, "tipoComprobante"],
  ["cfg-cc-consecutivo", c => c.compras, "consecutivo", "number"],
  ["cfg-cc-sucursal", c => c.compras, "sucursal"],
  ["cfg-cc-gasto", c => c.compras, "cuentaGasto"],
  ["cfg-cc-iva", c => c.compras, "cuentaIVADescontable"],
  ["cfg-cc-inc", c => c.compras, "cuentaINC"],
  ["cfg-cc-cxp", c => c.compras, "cuentaPorPagar"],
  ["cfg-cc-retefuente", c => c.compras, "cuentaReteFuente"],
  ["cfg-cc-reteica", c => c.compras, "cuentaReteICA"],
  ["cfg-cc-reteiva", c => c.compras, "cuentaReteIVA"],
  ["cfg-cc-codiva", c => c.compras, "codigoIVA"],
  ["cfg-fv-tipo", c => c.ventas, "tipoComprobante"],
  ["cfg-fv-consecutivo", c => c.ventas, "consecutivo", "number"],
  ["cfg-fv-sucursal", c => c.ventas, "sucursal"],
  ["cfg-fv-producto", c => c.ventas, "codigoProducto"],
  ["cfg-fv-formapago", c => c.ventas, "codigoFormaPago"],
  ["cfg-fv-vendedor", c => c.ventas, "identificacionVendedor"],
  ["cfg-fv-codiva", c => c.ventas, "codigoIVA"],
  ["cfg-fecha", c => c, "formatoFecha"]
];

function configToForm() {
  for (const [id, section, key] of CONFIG_FIELDS) $(id).value = section(config)[key];
  renderReglas();
}

function formToConfig() {
  for (const [id, section, key, type] of CONFIG_FIELDS) {
    const v = $(id).value.trim();
    section(config)[key] = type === "number" ? (parseInt(v, 10) || 0) : v;
  }
  saveConfig(config);
  setStatus("cfg-status", "Configuración guardada ✔");
  refreshPreview();
}

function renderReglas() {
  const tbody = $("reglas-body");
  tbody.innerHTML = "";
  config.reglasCuenta.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.nit}</td><td>${r.cuenta}</td><td>${r.nota || ""}</td>
      <td><button class="link" data-i="${i}">Eliminar</button></td>`;
    tr.querySelector("button").onclick = () => {
      config.reglasCuenta.splice(i, 1);
      saveConfig(config);
      renderReglas();
      refreshPreview();
    };
    tbody.appendChild(tr);
  });
}

function addRegla() {
  const nit = $("regla-nit").value.trim();
  const cuenta = $("regla-cuenta").value.trim();
  const nota = $("regla-nota").value.trim();
  if (!nit || !cuenta) { alert("Indique NIT y cuenta contable"); return; }
  config.reglasCuenta = config.reglasCuenta.filter(r => r.nit !== nit);
  config.reglasCuenta.push({ nit, cuenta, nota });
  saveConfig(config);
  $("regla-nit").value = $("regla-cuenta").value = $("regla-nota").value = "";
  renderReglas();
  refreshPreview();
}

/* ---------- Importación y revisión ---------- */

async function importarDian() {
  const file = $("archivo-dian").files[0];
  if (!file) { alert("Seleccione el reporte .xlsx descargado de la DIAN"); return; }
  try {
    const wb = await readWorkbook(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const docs = parseDianRows(rows);
    if (!docs.length) {
      alert("No se encontraron documentos. Verifique que el archivo sea el reporte de documentos electrónicos de la DIAN.");
      return;
    }
    documentos = docs.map(doc => {
      const ruta = routeDoc(doc);
      return { doc, destino: ruta.destino, motivo: ruta.motivo, incluir: ruta.destino !== "excluir" };
    });
    setStatus("import-status", `${docs.length} documento(s) leídos de "${file.name}"`);
    refreshPreview();
    $("seccion-revision").classList.remove("hidden");
    $("seccion-exportar").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert("No fue posible leer el archivo: " + err.message);
  }
}

function refreshPreview() {
  const tbody = $("preview-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  documentos.forEach((item, i) => {
    const d = item.doc;
    const tercero = d.esRecibido ? `${d.nombreEmisor} (${d.nitEmisor})` : `${d.nombreReceptor} (${d.nitReceptor})`;
    const tr = document.createElement("tr");
    if (!item.incluir) tr.classList.add("excluido");
    tr.innerHTML = `
      <td><input type="checkbox" ${item.incluir ? "checked" : ""} data-i="${i}"></td>
      <td>${d.tipoDoc}</td>
      <td>${d.prefijo}${d.folio}</td>
      <td>${formatDate(d.fecha, config.formatoFecha)}</td>
      <td>${tercero}</td>
      <td class="num">${d.total.toLocaleString("es-CO")}</td>
      <td class="num">${d.iva.toLocaleString("es-CO")}</td>
      <td><span class="badge badge-${item.destino}">${
        item.destino === "comprobante" ? "Comprobante" :
        item.destino === "factura" ? "Factura venta" : "Excluido"}</span></td>
      <td class="motivo">${item.motivo}</td>`;
    tr.querySelector("input").onchange = e => {
      item.incluir = e.target.checked;
      tr.classList.toggle("excluido", !item.incluir);
      updateContadores();
    };
    tbody.appendChild(tr);
  });
  updateContadores();
}

function updateContadores() {
  const inc = documentos.filter(x => x.incluir);
  const nComp = inc.filter(x => x.destino === "comprobante").length;
  const nFact = inc.filter(x => x.destino === "factura").length;
  const nExc = documentos.length - inc.length;
  $("contadores").textContent =
    `${nComp} → comprobantes contables · ${nFact} → facturas de venta · ${nExc} excluidos`;
}

/* ---------- Exportación ---------- */

function exportarComprobantes() {
  const items = documentos.filter(x => x.incluir && x.destino === "comprobante");
  if (!items.length) { alert("No hay documentos marcados con destino Comprobante"); return; }
  if (!config.compras.tipoComprobante) {
    alert("Configure el tipo de comprobante de compras (debe existir en SIIGO) antes de exportar.");
    return;
  }
  let consecutivo = config.compras.consecutivo;
  const grupos = [];
  const descuadres = [];
  let nFilas = 0;
  for (const item of items) {
    const fs = mapToComprobante(item.doc, consecutivo, config);
    const deb = round2(fs.reduce((s, f) => s + num(f["Débito"]), 0));
    const cre = round2(fs.reduce((s, f) => s + num(f["Crédito"]), 0));
    if (deb !== cre) descuadres.push(`Consecutivo ${consecutivo}: débitos ${deb} ≠ créditos ${cre}`);
    grupos.push(fs);
    nFilas += fs.length;
    consecutivo++;
  }
  const nArchivos = exportChunks(grupos, SIIGO_COMPROBANTES_HEADERS, "Datos", "SIIGO_Comprobantes");
  config.compras.consecutivo = consecutivo;
  saveConfig(config);
  configToForm();
  setStatus("export-status",
    `✔ ${items.length} comprobante(s), ${nFilas} fila(s) en ${nArchivos} archivo(s) (máx. ${MAX_FILAS_SIIGO} registros c/u). Próximo consecutivo: ${consecutivo}.` +
    (descuadres.length ? `\n⚠ Descuadres detectados (SIIGO los rechazará):\n${descuadres.join("\n")}` : "\n✔ Todos los comprobantes cumplen partida doble (débitos = créditos)."));
}

// SIIGO exige que estos catálogos existan antes de importar facturas de venta
function validarConfigVentas() {
  const faltan = [];
  if (!config.ventas.tipoComprobante) faltan.push("Tipo de comprobante de ventas");
  if (!config.ventas.codigoProducto) faltan.push("Código de producto genérico (debe existir en el catálogo de SIIGO)");
  if (!config.ventas.codigoFormaPago) faltan.push("Código de forma de pago (obligatorio; si es crédito, SIIGO exige fecha de vencimiento)");
  return faltan;
}

function exportarFacturas() {
  const items = documentos.filter(x => x.incluir && x.destino === "factura");
  if (!items.length) { alert("No hay documentos marcados con destino Factura de venta"); return; }
  const faltan = validarConfigVentas();
  if (faltan.length) {
    const seguir = confirm(
      "Faltan datos de configuración que SIIGO exige para importar facturas:\n\n- " +
      faltan.join("\n- ") +
      "\n\n¿Exportar de todos modos? (SIIGO probablemente rechazará el archivo)");
    if (!seguir) return;
  }
  let consecutivo = config.ventas.consecutivo;
  const grupos = [];
  for (const item of items) {
    grupos.push(mapToFacturaVenta(item.doc, consecutivo, config));
    consecutivo++;
  }
  const nArchivos = exportChunks(grupos, SIIGO_FACTURAS_HEADERS, "Hoja1", "SIIGO_FacturasVenta");
  config.ventas.consecutivo = consecutivo;
  saveConfig(config);
  configToForm();
  setStatus("export-status",
    `✔ ${items.length} factura(s) de venta en ${nArchivos} archivo(s) (máx. ${MAX_FILAS_SIIGO} registros c/u). Próximo consecutivo: ${consecutivo}.`);
}

/* ---------- Varios ---------- */

function setStatus(id, msg) {
  $(id).textContent = msg;
}

document.addEventListener("DOMContentLoaded", () => {
  configToForm();
  $("btn-guardar-config").onclick = formToConfig;
  $("btn-add-regla").onclick = addRegla;
  $("btn-importar").onclick = importarDian;
  $("btn-exportar-comprobantes").onclick = exportarComprobantes;
  $("btn-exportar-facturas").onclick = exportarFacturas;
});
