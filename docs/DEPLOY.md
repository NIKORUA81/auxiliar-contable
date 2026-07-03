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

## Parte D · Base de datos PostgreSQL — SUPERADA, ver `plataforma/`

**Esta parte quedó reemplazada.** El backend ya existe en [`plataforma/`](../plataforma) con
su propia guía completa de despliegue (Docker Compose: `db` + `api` + `web`) en
[`plataforma/README.md`](../plataforma/README.md), incluida la conexión de PgAdmin por túnel
SSH. Esta Parte D (crear DB/usuario a mano y correr `sql/schema.sql`) solo aplica si prefieres
usar un PostgreSQL del VPS ya existente **en lugar** del contenedor `db` del compose — en ese
caso sigue siendo válida como bootstrap manual, pero el esquema autoritativo ahora es
[`plataforma/prisma/schema.prisma`](../plataforma/prisma/schema.prisma), gestionado con
migraciones de Prisma (no con `sql/schema.sql`, que quedó como referencia histórica).

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
