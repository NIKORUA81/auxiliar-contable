import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { api, session } from "../lib/api";

interface Empresa {
  id: string;
  nit: string;
  nombre: string;
  _count: { importJobs: number };
}

interface JobResumen {
  id: string;
  archivoOrigen: string;
  totalDocs: number;
  creadoEn: string;
}

export default function Empresas() {
  const nav = useNavigate();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobResumen[]>>({});
  const [nit, setNit] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function cargar() {
    const data = await api.get<Empresa[]>("/api/empresas");
    setEmpresas(data);
    const entries = await Promise.all(
      data.map(async (e) => [e.id, await api.get<JobResumen[]>(`/api/empresas/${e.id}/importaciones`)] as const)
    );
    setJobs(Object.fromEntries(entries));
  }

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, []);

  async function crearEmpresa() {
    setError("");
    try {
      await api.post("/api/empresas", { nit, nombre });
      setNit("");
      setNombre("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function subirReporte(empresaId: string, file: File) {
    setError("");
    setSubiendo(empresaId);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const job = await api.post<{ id: string }>(`/api/empresas/${empresaId}/importaciones`, fd);
      nav(`/empresas/${empresaId}/importaciones/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir el archivo");
    } finally {
      setSubiendo(null);
    }
  }

  return (
    <>
      <header className="topbar">
        <h1>Auxiliar Contable</h1>
        <div className="row">
          <span className="muted small">{session.usuario?.nombre}</span>
          <ThemeToggle />
          <button
            className="btn-secondary"
            style={{ width: "auto" }}
            onClick={() => {
              session.clear();
              nav("/login");
            }}
          >
            Salir
          </button>
        </div>
      </header>

      <main className="container">
        {error && <div className="alert alert-error">{error}</div>}

        <div className="card">
          <h2 style={{ fontSize: "1.1rem" }}>Nueva empresa</h2>
          <div className="form-row">
            <div>
              <label>NIT (sin DV)</label>
              <input placeholder="900123456" value={nit} onChange={(e) => setNit(e.target.value)} />
            </div>
            <div>
              <label>Razón social</label>
              <input placeholder="Mi Empresa S.A.S." value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={crearEmpresa} disabled={!nit || !nombre}>
              Agregar a mi cartera
            </button>
          </div>
        </div>

        <h2 style={{ fontSize: "1.15rem" }}>Mi cartera ({empresas.length})</h2>

        <div className="cards-grid">
          {empresas.map((emp) => (
            <div className="card" key={emp.id}>
              <div className="empresa-head">
                <div>
                  <strong>{emp.nombre}</strong>
                  <div className="muted small mono">NIT {emp.nit}</div>
                </div>
                <div className="botones">
                  <Link to={`/empresas/${emp.id}/config`} style={{ display: "contents" }}>
                    <button className="btn-secondary">Configuración</button>
                  </Link>
                  <input
                    type="file"
                    accept=".xlsx"
                    hidden
                    ref={(el) => (fileRefs.current[emp.id] = el)}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) subirReporte(emp.id, f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    className="btn-primary"
                    disabled={subiendo === emp.id}
                    onClick={() => fileRefs.current[emp.id]?.click()}
                  >
                    {subiendo === emp.id ? "Procesando..." : "Importar reporte"}
                  </button>
                </div>
              </div>

              {jobs[emp.id]?.length ? (
                <table className="responsive" style={{ marginTop: "0.9rem" }}>
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th className="num">Docs</th>
                      <th>Fecha</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs[emp.id].slice(0, 5).map((j) => (
                      <tr key={j.id}>
                        <td data-label="Archivo">{j.archivoOrigen}</td>
                        <td className="num" data-label="Docs">{j.totalDocs}</td>
                        <td className="small muted" data-label="Fecha">
                          {new Date(j.creadoEn).toLocaleString("es-CO")}
                        </td>
                        <td data-label="">
                          <Link to={`/empresas/${emp.id}/importaciones/${j.id}`}>Revisar →</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted small" style={{ marginBottom: 0, marginTop: "0.9rem" }}>
                  Sin importaciones todavía. Sube el reporte .xlsx de documentos electrónicos de la DIAN.
                </p>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
