import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle";
import { api, session, type Usuario } from "../lib/api";

export default function Login() {
  const nav = useNavigate();
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar() {
    setError("");
    setCargando(true);
    try {
      const body = modo === "login" ? { email, password } : { nombre, email, password };
      const data = await api.post<{ token: string; usuario: Usuario }>(
        `/api/auth/${modo === "login" ? "login" : "registro"}`,
        body
      );
      session.set(data.token, data.usuario);
      nav("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="sello">AC</div>
        <h1 style={{ textAlign: "center", fontSize: "clamp(1.2rem, 4vw, 1.4rem)" }}>
          Auxiliar Contable
        </h1>
        <p className="muted small" style={{ textAlign: "center", marginTop: 0 }}>
          Del reporte DIAN a los modelos de importación de SIIGO
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {modo === "registro" && (
          <div className="field">
            <label>Nombre completo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label>Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === "login" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
          />
        </div>

        <button className="btn-primary" style={{ width: "100%" }} onClick={enviar} disabled={cargando}>
          {cargando ? "Un momento..." : modo === "login" ? "Entrar" : "Crear cuenta de contador"}
        </button>

        <p className="small" style={{ textAlign: "center" }}>
          {modo === "login" ? (
            <>¿Primera vez? <button className="btn-link" onClick={() => setModo("registro")}>Crea tu cuenta de contador</button></>
          ) : (
            <>¿Ya tienes cuenta? <button className="btn-link" onClick={() => setModo("login")}>Inicia sesión</button></>
          )}
        </p>
      </div>
    </div>
  );
}
