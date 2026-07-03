# Despliegue en VPS (CloudPanel) + subdominio + base de datos

Guía paso a paso para publicar el prototipo en un subdominio propio (ej. `auxiliar.wolfiax.com`)
usando CloudPanel en tu VPS de Hostinger, y dejar PostgreSQL preparado (vía pgAdmin) para
cuando conectemos un backend real.

> Esta guía asume que **tú** ejecutas los comandos (Claude Code no tiene acceso SSH a tu VPS).
> Sustituye `auxiliar.wolfiax.com` por el subdominio que prefieras en todos los pasos.

---

## Parte A · DNS del subdominio

1. Entra al panel donde administras el DNS de `wolfiax.com` (Hostinger → Dominios → DNS,
   o el proveedor donde esté delegado el dominio).
2. Crea un registro:
   - **Tipo**: `A`
   - **Nombre/Host**: `auxiliar` (queda como `auxiliar.wolfiax.com`)
   - **Valor**: la IP pública de tu VPS (la misma que usan tus otros sitios en CloudPanel)
   - **TTL**: el que esté por defecto (300–3600)
3. Espera la propagación (unos minutos, a veces hasta 1 hora). Puedes verificar con:
   ```bash
   nslookup auxiliar.wolfiax.com
   ```

---

## Parte B · Crear el sitio en CloudPanel

1. Entra a CloudPanel (`https://TU_IP:8443` o el dominio que uses para administrarlo).
2. **Sites → Add Site → Create a Static Site**
   - **Domain Name**: `auxiliar.wolfiax.com`
   - Site User: se genera automáticamente (o defínelo, ej. `auxiliarcontable`)
3. Al crear el sitio, CloudPanel muestra las credenciales **SFTP** (usuario, host, puerto).
   Guárdalas — las usarás para subir los archivos.
4. La raíz del sitio queda normalmente en:
   ```
   /home/<site-user>/htdocs/auxiliar.wolfiax.com/
   ```

### SSL (HTTPS)

5. En la ficha del sitio, ve a la pestaña **SSL/TLS**.
6. **Actions → New Let's Encrypt Certificate** (o "Add Certificate" según versión) →
   confirma `auxiliar.wolfiax.com` → emitir. CloudPanel auto-renueva el certificado.

---

## Parte C · Subir los archivos de la aplicación

La app es 100% estática (HTML/CSS/JS, sin build ni dependencias de servidor), así que solo
hay que copiar los archivos a la raíz del sitio. Dos formas:

### Opción 1 — SFTP (más simple, sin terminal)

1. Con un cliente SFTP (FileZilla, Cyberduck, o el "File Manager" integrado de CloudPanel)
   conéctate con las credenciales del paso B.3.
2. Sube el **contenido** de este repositorio (no la carpeta en sí) a
   `/home/<site-user>/htdocs/auxiliar.wolfiax.com/`:
   - `index.html`
   - `css/`
   - `js/` (incluye `js/vendor/xlsx.full.min.js`, ya vendorizado — no depende de ningún CDN)
   - opcional: `docs/`, `samples/`, `README.md` (no afectan el funcionamiento, solo referencia)

### Opción 2 — Git clone por SSH (recomendado, permite actualizar con `git pull`)

1. Conéctate por SSH al VPS con el usuario del sitio (o uno con permisos):
   ```bash
   ssh <site-user>@TU_IP
   ```
2. Clona el repositorio directo en la raíz del sitio (vacíala primero si CloudPanel dejó
   un `index.html` de ejemplo):
   ```bash
   cd /home/<site-user>/htdocs/auxiliar.wolfiax.com
   rm -f index.html   # si existe un placeholder
   git clone https://github.com/NIKORUA81/auxiliar-contable.git tmp
   mv tmp/* tmp/.git .
   rmdir tmp
   git checkout claude/dian-siigo-import-app-lquv5j   # o main, cuando hagas el merge
   ```
3. Para actualizar en el futuro tras cada cambio en GitHub:
   ```bash
   cd /home/<site-user>/htdocs/auxiliar.wolfiax.com
   git pull origin claude/dian-siigo-import-app-lquv5j
   ```
   Hay un script listo para esto en `scripts/deploy.sh` (ver Parte E).

4. Verifica permisos (CloudPanel corre el sitio con el usuario del sitio, no root):
   ```bash
   chown -R <site-user>:<site-user> /home/<site-user>/htdocs/auxiliar.wolfiax.com
   ```

### Verificación

Abre `https://auxiliar.wolfiax.com` — debe verse la pantalla de configuración de la pyme
(Paso 1). Prueba el flujo completo con `samples/Reporte_Dian_Ejemplo.xlsx` si lo subiste.

---

## Parte D · Base de datos PostgreSQL (preparada para el backend futuro)

**Importante**: la app publicada arriba **no usa base de datos todavía** — sigue guardando
la configuración en el navegador (`localStorage`). Esta parte deja Postgres listo para
cuando construyamos el backend (cuentas de usuario, varias pymes por contador, historial
de importaciones), que es la siguiente iteración del roadmap (`docs/analisis.md` §6).

1. En pgAdmin, conéctate a tu servidor Postgres del VPS.
2. Crea una base de datos dedicada:
   ```sql
   CREATE DATABASE auxiliar_contable;
   ```
3. Crea un usuario de aplicación (no uses el superusuario `postgres` para el backend):
   ```sql
   CREATE USER auxiliar_app WITH PASSWORD 'CAMBIA_ESTA_CLAVE';
   GRANT ALL PRIVILEGES ON DATABASE auxiliar_contable TO auxiliar_app;
   ```
4. Ejecuta el esquema inicial preparado en [`sql/schema.sql`](../sql/schema.sql) (ábrelo en
   el Query Tool de pgAdmin conectado a `auxiliar_contable`, o desde consola):
   ```bash
   psql -h localhost -U auxiliar_app -d auxiliar_contable -f sql/schema.sql
   ```
5. **Seguridad**: si Postgres escucha en la IP pública del VPS, restringe el acceso:
   - `postgresql.conf` → `listen_addresses = 'localhost'` (si el backend correrá en el
     mismo VPS) o solo la IP interna necesaria.
   - `pg_hba.conf` → limita por IP/usuario, no dejes `0.0.0.0/0` con `trust`.
   - pgAdmin normalmente se conecta por túnel SSH o VPN, no exponiendo el puerto 5432
     directamente a internet.
   - Nunca subas la contraseña real al repositorio (usa variables de entorno `.env`,
     que ya está en `.gitignore`).

Cuando quieras que construya el backend (API + autenticación + conexión a estas tablas),
dímelo explícitamente — es un cambio de arquitectura, no solo un despliegue.

---

## Parte E · Actualizar el sitio tras cambios futuros

Con el método de git clone (Parte C, Opción 2), cada vez que aprobemos cambios y los suba
a GitHub, en el VPS solo necesitas:

```bash
bash scripts/deploy.sh
```

(ver `scripts/deploy.sh` — hace `git pull` y ajusta permisos). Si prefieres automatizarlo
por completo con cada push a GitHub, se puede configurar un webhook + un pequeño listener
en el VPS, pero eso es opcional y se puede dejar para más adelante.
