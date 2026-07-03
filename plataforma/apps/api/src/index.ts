import cors from "cors";
import express from "express";
import authRouter from "./routes/auth";
import empresasRouter from "./routes/empresas";
import importacionesRouter from "./routes/importaciones";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: false,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/empresas", empresasRouter);
app.use("/api", importacionesRouter);

// Manejador central de errores: nunca filtrar detalles internos al cliente
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`API escuchando en http://0.0.0.0:${PORT}`);
});
