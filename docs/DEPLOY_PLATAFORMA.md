# Despliegue de la plataforma completa (Docker Compose)

Guía paso a paso para desplegar `plataforma/` (backend + frontend + PostgreSQL) en un
**segundo subdominio**, en paralelo al prototipo estático que ya tienes corriendo en
`auxiliar.wolfiax.com`. No toca ese sitio para nada.

> Como en la guía anterior, esto lo ejecutas tú en el VPS — no tengo acceso SSH.
> Sustituye `plataforma.wolfiax.com` por el subdominio que prefieras.

Tu VPS ya tiene CloudPanel con varios sitios (`wolfiax.com`, `db.wolfiax.com`,
`api.wolfiax.com`, `portainer.wolfiax.com`, `n8n.wolfiax.com`, `arquitesis.wolfiax.com`,
`auxiliar.wolfiax.com`). La presencia de `portainer.wolfiax.com` indica que **Docker ya
está instalado** — no hace falta instalarlo. Pero sí hay que verificar que los puertos
que usa el compose (`8090` y `5433`) estén libres antes de arrancar.

---

## Parte A · Verificar Docker y puertos libres

```bash
docker --version && docker compose version

# ¿algo ya escucha en estos puertos?
ss -tlnp | grep -E ':8090|:5433'
```

- Si `docker --version` falla, avísame (no debería pasar dado que Portainer ya corre ahí).
- Si el `ss` muestra algo ocupando `8090` o `5433`, cambia los puertos en
  `plataforma/docker-compose.yml` (por ejemplo `8091:80` y `5434:5432`) **antes** de
  levantar el compose, y ajusta el resto de la guía con esos puertos.

---

## Parte B · DNS del nuevo subdominio

Igual que con `auxiliar.wolfiax.com`: en el panel de DNS de `wolfiax.com`, crea:

- **Tipo**: `A` · **Nombre**: `plataforma` (queda `plataforma.wolfiax.com`) ·
  **Valor**: la misma IP pública del VPS.

---

## Parte C · Clonar el repo en una ubicación dedicada

**Importante**: clónalo en una carpeta que **ningún sitio de CloudPanel sirva como
docroot** (a diferencia del prototipo estático, aquí Docker sirve el contenido — si
clonas dentro de un `htdocs/`, nginx podría exponer el código fuente y los Dockerfiles
bajo esa URL pública, algo que no queremos).

```bash
mkdir -p /opt
git clone https://github.com/NIKORUA81/auxiliar-contable.git /opt/auxiliar-contable-plataforma
cd /opt/auxiliar-contable-plataforma
git checkout claude/dian-siigo-import-app-lquv5j
cd plataforma
```

---

## Parte D · Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Completa:
- `POSTGRES_PASSWORD`: una clave fuerte (ej. genera una con `openssl rand -base64 24`).
- `JWT_SECRET`: `openssl rand -base64 48` y pega el resultado.

Guarda y sal (`Ctrl+O`, `Enter`, `Ctrl+X` en nano).

---

## Parte E · Levantar los contenedores

```bash
docker compose up -d --build
```

La primera vez compila las imágenes (puede tardar unos minutos). Al terminar, verifica:

```bash
docker compose ps
```

Los tres servicios (`db`, `api`, `web`) deben mostrar `running` / `healthy`. Si `api`
se reinicia en bucle, revisa el log:

```bash
docker compose logs --tail=100 api
```

Prueba el backend directo (sin pasar por CloudPanel todavía):

```bash
curl http://127.0.0.1:8090/api/health
# debe responder: {"ok":true}
```

---

## Parte F · Crear el usuario administrador

```bash
docker compose exec api sh -c \
  'ADMIN_EMAIL=admin@wolfiax.com ADMIN_PASSWORD=UnaClaveFuerte node dist/seed.js'
```

Cambia el correo y la clave. Los contadores normales se registran solos desde el login;
este admin es solo para tener una cuenta con visibilidad total desde el día uno.

---

## Parte G · Sitio "Reverse Proxy" en CloudPanel + SSL

1. CloudPanel → **Sites → Add Site → Create a Reverse Proxy**
   (o "Add Reverse Proxy Site", según la versión).
2. **Domain Name**: `plataforma.wolfiax.com`
3. **Reverse Proxy URL**: `http://127.0.0.1:8090`
4. Guarda. En la pestaña **SSL/TLS** del nuevo sitio: **Actions → New Let's Encrypt
   Certificate** → confirma `plataforma.wolfiax.com` → emitir.

---

## Parte H · Verificación final

Abre `https://plataforma.wolfiax.com` — debe cargar la pantalla de login de React.
Crea una cuenta de contador (o entra con el admin del Paso F), agrega una empresa de
prueba y sube `samples/Reporte_Dian_Ejemplo.xlsx` (está en la raíz del repo, no en
`plataforma/`) para probar el flujo completo de importación y exportación.

---

## Parte I · Conectar PgAdmin (base de datos, no expuesta a internet)

1. En PgAdmin: clic derecho en *Servers* → *Register* → *Server*.
2. **General** → nombre `Auxiliar Contable — Plataforma`.
3. **Connection**:
   - Host: `localhost` · Port: `5433` (o el que hayas usado si cambiaste el default)
   - Maintenance DB: `auxiliar_contable`
   - Username: `auxiliar` · Password: la que pusiste en `.env`
4. **SSH Tunnel** → activa *Use SSH tunneling*:
   - Tunnel host: IP o dominio del VPS
   - Username: tu usuario SSH habitual
   - Autenticación: tu llave SSH

No hace falta crear la base a mano: el contenedor `db` la crea al primer arranque y
Prisma ya trae la migración aplicada (`plataforma/prisma/migrations/`).

---

## Parte J · Actualizar tras cambios futuros

```bash
cd /opt/auxiliar-contable-plataforma
git pull origin claude/dian-siigo-import-app-lquv5j
cd plataforma
docker compose up -d --build
```

Las migraciones nuevas de Prisma (si las hay) se aplican automáticamente al reiniciar
el contenedor `api`.
