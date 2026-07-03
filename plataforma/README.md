# Auxiliar Contable — DIAN → SIIGO

Plataforma web multi-empresa para contadores: importa el reporte de documentos
electrónicos de la DIAN (.xlsx), clasifica cada documento, aplica el motor
contable de partida doble y genera los archivos modelo de importación de SIIGO
(comprobantes contables y facturas de venta), respetando los encabezados
exactos y el límite de 500 registros por archivo.

## Arquitectura

```
auxiliar-contable/
├── packages/motor-dian-siigo/   Motor puro (parser, enrutador, contabilizador, exportador)
├── apps/api/                    API Express + TypeScript + Prisma (PostgreSQL)
├── apps/web/                    Frontend React + Vite (servido por nginx en producción)
├── prisma/schema.prisma         Esquema de base de datos
└── docker-compose.yml           db + api + web
```

Roles: **CONTADOR** (registra su cuenta, administra su cartera de empresas),
**EMPRESA** (acceso de solo su empresa, vía vínculo creado por el contador o
admin), **ADMIN** (acceso total, creado por seed).

## Desarrollo local

Requisitos: Node 20+, PostgreSQL local (o el contenedor `db` del compose).

```bash
npm install
cp .env.example .env            # complete POSTGRES_PASSWORD y JWT_SECRET

# levantar solo la base de datos
docker compose up -d db

# variables para el API en desarrollo
export DATABASE_URL="postgresql://auxiliar:SU_CLAVE@localhost:5433/auxiliar_contable"
export JWT_SECRET="un-secreto-local"

npx prisma migrate dev --name init   # crea las tablas
npm run build -w @auxiliar/motor-dian-siigo
npm run dev:api                       # http://localhost:3001
npm run dev:web                       # http://localhost:5173 (proxy /api → 3001)
```

## Despliegue en el VPS (GitHub → Docker)

### 1. Subir a GitHub

```bash
cd auxiliar-contable
git init
git add .
git commit -m "Auxiliar Contable v1.0"
git branch -M main
git remote add origin git@github.com:NIKORUA81/auxiliar-contable.git
git push -u origin main
```

### 2. En el VPS

```bash
ssh nikorua81@SU_VPS
git clone git@github.com:NIKORUA81/auxiliar-contable.git
cd auxiliar-contable
cp .env.example .env
nano .env        # POSTGRES_PASSWORD fuerte + JWT_SECRET (openssl rand -base64 48)

docker compose up -d --build
```

El compose deja:
- `web` en `127.0.0.1:8090` → apunte aquí su vhost de CloudPanel (reverse proxy)
  o el ingress del Cloudflare Tunnel, con el dominio que elija (ej.
  `auxiliar.nikorua.com`).
- `db` en `127.0.0.1:5433` → accesible solo desde el propio VPS.

Las migraciones de Prisma se aplican automáticamente al arrancar el contenedor
`api` (`prisma migrate deploy`).

### 3. Crear el usuario administrador (opcional)

```bash
docker compose exec api sh -c \
  'ADMIN_EMAIL=admin@nikorua.com ADMIN_PASSWORD=UnaClaveFuerte node dist/seed.js'
```

Los contadores se registran solos desde la pantalla de login.

### 4. Actualizaciones

```bash
cd auxiliar-contable
git pull
docker compose up -d --build
```

## Conectar PgAdmin a la base de datos

La base **no está expuesta a internet** (buena práctica); se accede por túnel SSH:

1. En PgAdmin: clic derecho en *Servers* → *Register* → *Server*.
2. Pestaña **General**: nombre `Auxiliar Contable VPS`.
3. Pestaña **Connection**:
   - Host: `localhost` · Port: `5433`
   - Maintenance DB: `auxiliar_contable`
   - Username: `auxiliar` · Password: la de su `.env`
4. Pestaña **SSH Tunnel**: activar *Use SSH tunneling*:
   - Tunnel host: IP o dominio del VPS
   - Username: `nikorua81`
   - Autenticación: su llave SSH habitual

Con eso PgAdmin ve las tablas (`usuarios`, `contadores`, `empresas`,
`configs_contables`, `reglas_cuenta`, `import_jobs`, `documentos_importados`).
No es necesario crear la base a mano: el contenedor `db` la crea al primer
arranque y Prisma crea las tablas con la migración.

> Si prefiere usar un PostgreSQL ya existente del VPS en lugar del contenedor,
> cree la base y el usuario en PgAdmin con:
> ```sql
> CREATE USER auxiliar WITH PASSWORD 'SU_CLAVE';
> CREATE DATABASE auxiliar_contable OWNER auxiliar;
> ```
> y ajuste `DATABASE_URL` en el servicio `api` del compose.

## Flujo de uso

1. El contador crea su cuenta e ingresa.
2. Agrega cada empresa cliente (NIT + razón social) y llena su **configuración
   contable** una sola vez: cuentas PUC, códigos de impuesto SIIGO,
   consecutivos y reglas de cuenta por NIT de proveedor.
3. Sube el reporte `.xlsx` de documentos electrónicos descargado del portal de
   la DIAN de esa empresa.
4. Revisa la clasificación automática (comprobante / factura de venta /
   excluido, con motivo) y ajusta lo que necesite con los checkboxes.
5. Exporta: descarga un `.zip` con los `.xlsx` listos para el importador de
   SIIGO Nube más un `RESUMEN.txt` con el control de partida doble y el
   próximo consecutivo (que queda guardado automáticamente para la siguiente
   importación).

## Notas técnicas importantes

- Los encabezados de los modelos SIIGO en
  `packages/motor-dian-siigo/src/headers.ts` incluyen **espacios finales
  intencionales** extraídos byte a byte de las plantillas oficiales. SIIGO
  valida el texto exacto: no los "limpie".
- El consecutivo de comprobantes/facturas se actualiza en la base de datos al
  exportar, de modo que varias sesiones del mismo contador no repiten números.
- Límite de subida del reporte DIAN: 25 MB.
