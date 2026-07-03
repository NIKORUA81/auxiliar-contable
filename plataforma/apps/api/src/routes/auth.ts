import { Router } from "express";
import { z } from "zod";
import { firmarToken, hashPassword, prisma, verifyPassword } from "../lib/core";

const router = Router();

const registroSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

/** Registro público: crea un usuario CONTADOR con su perfil de contador. */
router.post("/registro", async (req, res) => {
  const parsed = registroSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { nombre, email, password } = parsed.data;

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) return res.status(409).json({ error: "Ya existe una cuenta con este correo" });

  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      email,
      passwordHash: await hashPassword(password),
      rol: "CONTADOR",
      contador: { create: {} },
    },
  });

  const token = firmarToken({ id: usuario.id, rol: usuario.rol, nombre: usuario.nombre });
  res.status(201).json({ token, usuario: { id: usuario.id, nombre, email, rol: usuario.rol } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Credenciales inválidas" });
  const { email, password } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !(await verifyPassword(password, usuario.passwordHash))) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos" });
  }

  const token = firmarToken({ id: usuario.id, rol: usuario.rol, nombre: usuario.nombre });
  res.json({
    token,
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
  });
});

export default router;
