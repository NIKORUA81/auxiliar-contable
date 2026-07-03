import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { api, ApiError, descargarBlob } from "../lib/api";

interface DocDIAN {
  tipoDoc: string;
  prefijo: string;
  folio: string;
  fecha: { d: number; m: number; y: number } | null;
  nitEmisor: string;
  nombreEmisor: string;
  nitReceptor: string;
  nombreReceptor: string;
  esRecibido: boolean;
  total: number;
  iva: number;
}

interface DocumentoRow {
  id: string;
  cufe: string;
  tipoDoc: string;
  destino: "comprobante" | "factura" | "excluir";
  motivo: string;
  incluir: boolean;
  datosJson: DocDIAN;
}

interface JobDetalle {
  id: string;
  empresaId: string;
  archivoOrigen: string;
  totalDocs: number;
  documentos: DocumentoRow[];
}

function fmtFecha(f: DocDIAN["fecha"]) {
  if (!f) return "";
  return `${String(f.d).padStart(2, "0")}/${String(f.m).padStart(2, "0")}/${f.y}`;
}

export default function Importacion() {
  const { empresaId, jobId } = useParams();
  const [job, setJob] = useState<JobDetalle | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [exportando, setExportando] = useState<string | null>(null);

  useEffect(() => {
    api.get<JobDetalle>(`/api/importaciones/${jobId}`).then(setJob).catch((e) => setError(e.message));
  }, [jobId]);

  const contadores = useMemo(() => {
    if (!job) return { comp: 0, fact: 0, exc: 0 };
    const inc = job.documentos.filter((d) => d.incluir);
    return {
      comp: inc.filter((d) => d.destino === "comprobante").length,
      fact: inc.filter((d) => d.destino === "factura").length,
      exc: job.documentos.length - inc.length,
    };
  }, [job]);

  async function toggleIncluir(doc: DocumentoRow) {
    if (!job) return;
    const incluir = !doc.incluir;
    setJob({
      ...job,
      documentos: job.documentos.map((d) => (d.id === doc.id ? { ...d, incluir } : d)),
    });
    try {
      await api.patch(`/api/importaciones/${job.id}/documentos/${doc.id}`, { incluir });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    }
  }

  async function exportar(tipo: "comprobantes" | "facturas", forzar = false) {
    setError("");
    setAviso("");
    setExportando(tipo);
    try {
      const blob = await api.post<Blob>(
        `/api/importaciones/${jobId}/exportar/${tipo}${forzar ? "?forzar=1" : ""}`
      );
      descargarBlob(blob, `SIIGO_${tipo}.zip`);
      setAviso(
        `✔ Exportación de ${tipo} descargada. Los archivos vienen en un .zip (máx. 500 registros por archivo) junto con un RESUMEN.txt.`
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const faltan = (e.payload as { faltan?: string[] })?.faltan ?? [];
        const seguir = window.confirm(
          `Faltan datos de configuración que SIIGO exige:\n\n- ${faltan.join("\n- ")}\n\n¿Exportar de todos modos? (SIIGO probablemente rechazará el archivo)`
        );
        if (seguir) return exportar(tipo, true);
      } else {
        setError(e instanceof Error ? e.message : "Error al exportar");
      }
    } finally {
      setExportando(null);
    }
  }

  if (!job) return <main className="container">{error || "Cargando…"}</main>;

  return (
    <>
      <header className="topbar">
        <h1>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>←</Link>{" "}
          Revisión de importación
        </h1>
        <div className="row">
          <span className="muted small">{job.archivoOrigen}</span>
          <ThemeToggle />
        </div>
      </header>

      <main className="container">
        {error && <div className="alert alert-error">{error}</div>}
        {aviso && <div className="alert alert-ok">{aviso}</div>}

        <div className="card actions-bar">
          <span>
            <strong>{contadores.comp}</strong> → comprobantes contables ·{" "}
            <strong>{contadores.fact}</strong> → facturas de venta ·{" "}
            <strong>{contadores.exc}</strong> excluidos
          </span>
          <div className="spacer" />
          <button
            className="btn-primary"
            disabled={!contadores.comp || exportando !== null}
            onClick={() => exportar("comprobantes")}
          >
            {exportando === "comprobantes" ? "Generando…" : "Exportar comprobantes"}
          </button>
          <button
            className="btn-primary"
            disabled={!contadores.fact || exportando !== null}
            onClick={() => exportar("facturas")}
          >
            {exportando === "facturas" ? "Generando…" : "Exportar facturas de venta"}
          </button>
        </div>

        <div className="card">
          <table className="responsive">
            <thead>
              <tr>
                <th></th>
                <th>Tipo</th>
                <th>Doc</th>
                <th>Fecha</th>
                <th>Tercero</th>
                <th className="num">Total</th>
                <th className="num">IVA</th>
                <th>Destino</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {job.documentos.map((d) => {
                const doc = d.datosJson;
                const tercero = doc.esRecibido
                  ? `${doc.nombreEmisor} (${doc.nitEmisor})`
                  : `${doc.nombreReceptor} (${doc.nitReceptor})`;
                return (
                  <tr key={d.id} className={d.incluir ? "" : "excluido"}>
                    <td className="check" data-label="">
                      <input type="checkbox" checked={d.incluir} onChange={() => toggleIncluir(d)} />
                    </td>
                    <td data-label="Tipo">{d.tipoDoc}</td>
                    <td className="mono small" data-label="Doc">{doc.prefijo}{doc.folio}</td>
                    <td className="small" data-label="Fecha">{fmtFecha(doc.fecha)}</td>
                    <td className="small" data-label="Tercero">{tercero}</td>
                    <td className="num" data-label="Total">{doc.total.toLocaleString("es-CO")}</td>
                    <td className="num" data-label="IVA">{doc.iva.toLocaleString("es-CO")}</td>
                    <td data-label="Destino">
                      <span className={`badge badge-${d.destino}`}>
                        {d.destino === "comprobante"
                          ? "Comprobante"
                          : d.destino === "factura"
                            ? "Factura venta"
                            : "Excluido"}
                      </span>
                    </td>
                    <td className="small muted" data-label="Motivo">{d.motivo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="muted small">
          Empresa: <Link to={`/empresas/${empresaId}/config`}>ver configuración contable</Link> — las
          cuentas, códigos de impuesto y consecutivos usados en la exportación salen de allí.
        </p>
      </main>
    </>
  );
}
