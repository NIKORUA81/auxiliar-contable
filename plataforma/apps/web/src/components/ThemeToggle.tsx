import { useState } from "react";
import { aplicarTema, temaActual, type Tema } from "../lib/theme";

/** Botón sol/luna que alterna tema claro/oscuro y lo persiste. */
export default function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(temaActual());

  function alternar() {
    const nuevo: Tema = tema === "light" ? "dark" : "light";
    aplicarTema(nuevo);
    setTema(nuevo);
  }

  return (
    <button
      className="theme-toggle"
      onClick={alternar}
      title={tema === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
      aria-label="Cambiar tema"
    >
      {tema === "light" ? "🌙" : "☀️"}
    </button>
  );
}
