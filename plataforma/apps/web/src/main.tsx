import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { session } from "./lib/api";
import { inicializarTema } from "./lib/theme";
import ConfigEmpresa from "./pages/ConfigEmpresa";
import Empresas from "./pages/Empresas";
import Importacion from "./pages/Importacion";
import Login from "./pages/Login";
import "./styles.css";

inicializarTema();

function Protegida({ children }: { children: React.ReactNode }) {
  if (!session.token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protegida><Empresas /></Protegida>} />
        <Route path="/empresas/:empresaId/config" element={<Protegida><ConfigEmpresa /></Protegida>} />
        <Route path="/empresas/:empresaId/importaciones/:jobId" element={<Protegida><Importacion /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
