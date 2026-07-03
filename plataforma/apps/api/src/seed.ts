/**
 * Seed inicial: crea un usuario ADMIN si no existe.
 * Uso: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed -w @auxiliar/api
 */
import { hashPassword, prisma } from "./lib/core";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Defina ADMIN_EMAIL y ADMIN_PASSWORD para crear el administrador.");
    process.exit(1);
  }
  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    console.log("El administrador ya existe, nada que hacer.");
    return;
  }
  await prisma.usuario.create({
    data: {
      email,
      nombre: "Administrador",
      rol: "ADMIN",
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Administrador ${email} creado.`);
}

main().finally(() => prisma.$disconnect());
