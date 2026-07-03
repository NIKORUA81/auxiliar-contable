import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { api } from "../lib/api";

interface Config {
  ccTipoComprobante: string;
  ccConsecutivo: number;
  ccSucursal: string;
  ccCuentaGasto: string;
  ccCuentaIVADescontable: string;
  ccCuentaINC: string;
  ccCuentaPorPagar: string;
  ccCuentaReteFuente: string;
  ccCuentaReteICA: string;
  ccCuentaReteIVA: string;
  ccCodigoIVA: string;
  fvTipoComprobante: string;
  fvConsecutivo: number;
  fvSucursal: string;
  fvCodigoProducto: string;
  fvCodigoFormaPago: string;
  fvIdentificacionVendedor: string;
  fvCodigoIVA: string;
  formatoFecha: string;
}

interface Regla {
  id: string;
  nit: string;
  cuenta: string;
  nota: string;
}

interface EmpresaDetalle {
  id: string;
  nit: string;
  nombre: string;
  config: Config | null;
  reglasCuenta: Regla[];
}

const CAMPOS_COMPRAS: [keyof Config, string][] = [
  ["ccTipoComprobante", "Tipo de comprobante"],
  ["ccConsecutivo", "Próximo consecutivo"],
  ["ccSucursal", "Sucursal (opcional)"],
  ["ccCuentaGasto", "Cuenta de gasto por defecto"],
  ["ccCuentaIVADescontable", "Cuenta IVA descontable"],
  ["ccCuentaINC", "Cuenta INC"],
  ["ccCuentaPorPagar", "Cuenta por pagar"],
  ["ccCuentaReteFuente", "Cuenta ReteFuente"],
  ["ccCuentaReteICA", "Cuenta ReteICA"],
  ["ccCuentaReteIVA", "Cuenta ReteIVA"],
  ["ccCodigoIVA", "Código impuesto IVA (SIIGO)"],
];

const CAMPOS_VENTAS: [keyof Config, string][] = [
  ["fvTipoComprobante", "Tipo de comprobante"],
  ["fvConsecutivo", "Próximo consecutivo"],
  ["fvSucursal", "Sucursal (opcional)"],
  ["fvCodigoProducto", "Código producto genérico"],
  ["fvCodigoFormaPago", "Código forma de pago"],
  ["fvIdentificacionVendedor", "Identificación vendedor"],
  ["fvCodigoIVA", "Código impuesto IVA (SIIGO)"],
];

export default function ConfigEmpresa() {
  const { empresaId } = useParams();
  const [empresa, setEmpresa] = useState<EmpresaDetalle | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [reglaNit, setReglaNit] = useState("");
  const [reglaCuenta, setReglaCuenta] = useState("");
  const [reglaNota, setReglaNota] = useState("");

  async function cargar() {
    const data = await api.get<EmpresaDetalle>(`/api/empresas/${empresaId}`);
    setEmpresa(data);
    setCfg(data.config);
  }

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [empresaId]);

  function setCampo(k: keyof Config, v: string) {
    if (!cfg) return;
    const esNumero = k === "ccConsecutivo" || k === "fvConsecutivo";
    setCfg({ ...cfg, [k]: esNumero ? parseInt(v, 10) || 0 : v });
  }

  async function guardar() {
    if (!cfg) return;
    setMsg("");
    setError("");
    try {
      await api.put(`/api/empresas/${empresaId}/config`, cfg);
      setMsg("Configuración guardada ✔");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function agregarRegla() {
    setError("");
    try {
      await api.post(`/api/empresas/${empresaId}/reglas`, {
        nit: reglaNit,
        cuenta: reglaCuenta,
        nota: reglaNota,
      });
      setReglaNit("");
      setReglaCuenta("");
      setReglaNota("");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function eliminarRegla(id: string) {
    await api.del(`/api/empresas/${empresaId}/reglas/${id}`);
    await cargar();
  }

  if (!empresa || !cfg) return <main className="container">Cargando…</main>;

  const grupo = (campos: [keyof Config, string][]) => (
    <div className="grid2">
      {campos.map(([k, label]) => (
        <div className="field" key={k}>
          <label>{label}</label>
          <input value={String(cfg[k])} onChange={(e) => setCampo(k, e.target.value)} />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <header className="topbar">
        <h1>
          <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>←</Link>{" "}
          {empresa.nombre} <span className="muted mono small">NIT {empresa.nit}</span>
        </h1>
        <ThemeToggle />
      </header>

      <main className="container">
        {msg && <div className="alert alert-ok">{msg}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="config-grid">
          <div className="card">
            <h2 style={{ fontSize: "1.1rem" }}>Compras — comprobantes contables</h2>
            {grupo(CAMPOS_COMPRAS)}
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.1rem" }}>Ventas — facturas de venta</h2>
            {grupo(CAMPOS_VENTAS)}
            <div
              className="row"
              style={{
                marginTop: "1rem",
                borderTop: "1px solid var(--line)",
                paddingTop: "1rem",
              }}
            >
              <div className="field" style={{ flex: "0 0 200px" }}>
                <label>Formato de fecha</label>
                <select value={cfg.formatoFecha} onChange={(e) => setCampo("formatoFecha", e.target.value)}>
                  <option>DD/MM/YYYY</option>
                  <option>MM/DD/YYYY</option>
                  <option>YYYY-MM-DD</option>
                </select>
              </div>
              <div className="spacer" />
              <button className="btn-primary" onClick={guardar}>Guardar configuración</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: "var(--space)" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Reglas de cuenta por proveedor (NIT)</h2>
          <p className="muted small">
            Cuando un documento recibido venga de uno de estos NIT, el gasto se contabiliza en la
            cuenta indicada en lugar de la cuenta de gasto por defecto.
          </p>
          <div className="form-row cuatro" style={{ marginBottom: "0.9rem" }}>
            <div>
              <label>NIT proveedor</label>
              <input placeholder="900123456" value={reglaNit} onChange={(e) => setReglaNit(e.target.value)} />
            </div>
            <div>
              <label>Cuenta contable</label>
              <input placeholder="511010" value={reglaCuenta} onChange={(e) => setReglaCuenta(e.target.value)} />
            </div>
            <div>
              <label>Nota (opcional)</label>
              <input placeholder="Arriendos" value={reglaNota} onChange={(e) => setReglaNota(e.target.value)} />
            </div>
            <button className="btn-secondary" onClick={agregarRegla} disabled={!reglaNit || !reglaCuenta}>
              Agregar regla
            </button>
          </div>
          {empresa.reglasCuenta.length > 0 && (
            <table className="responsive">
              <thead>
                <tr><th>NIT</th><th>Cuenta</th><th>Nota</th><th></th></tr>
              </thead>
              <tbody>
                {empresa.reglasCuenta.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" data-label="NIT">{r.nit}</td>
                    <td className="mono" data-label="Cuenta">{r.cuenta}</td>
                    <td data-label="Nota">{r.nota}</td>
                    <td data-label="">
                      <button className="btn-link" onClick={() => eliminarRegla(r.id)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
