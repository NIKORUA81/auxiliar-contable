-- SUPERADO: este esquema preparatorio quedó reemplazado por el backend real en
-- plataforma/prisma/schema.prisma (mismas tablas, nombres en español/inglés
-- ligeramente distintos, gestionado con migraciones de Prisma vía
-- `npx prisma migrate deploy`, que se ejecuta automáticamente al levantar el
-- contenedor `api` de plataforma/docker-compose.yml). Ya no hace falta correr
-- este archivo a mano — se conserva solo como referencia histórica.
--
-- Uso (legado): psql -h localhost -U auxiliar_app -d auxiliar_contable -f sql/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- para gen_random_uuid()

-- Usuarios de la aplicación (contadores / administradores de la pyme)
CREATE TABLE usuarios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre        TEXT,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pymes/empresas configuradas (un usuario puede administrar varias)
CREATE TABLE empresas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nit           TEXT NOT NULL,
    razon_social  TEXT NOT NULL,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, nit)
);

-- Configuración contable de cada empresa (equivalente al objeto CONFIG del frontend)
CREATE TABLE configuraciones (
    empresa_id              UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    -- Compras
    cc_tipo_comprobante      TEXT NOT NULL DEFAULT 'CC',
    cc_consecutivo           INTEGER NOT NULL DEFAULT 1000,
    cc_sucursal              TEXT,
    cc_cuenta_gasto          TEXT NOT NULL DEFAULT '519595',
    cc_cuenta_iva_descontable TEXT NOT NULL DEFAULT '240820',
    cc_cuenta_inc            TEXT NOT NULL DEFAULT '511570',
    cc_cuenta_por_pagar      TEXT NOT NULL DEFAULT '233595',
    cc_cuenta_retefuente     TEXT NOT NULL DEFAULT '236540',
    cc_cuenta_reteica        TEXT NOT NULL DEFAULT '236801',
    cc_cuenta_reteiva        TEXT NOT NULL DEFAULT '236701',
    cc_codigo_iva            TEXT NOT NULL DEFAULT 'IVA19',
    -- Ventas
    fv_tipo_comprobante      TEXT NOT NULL DEFAULT 'FV',
    fv_consecutivo           INTEGER NOT NULL DEFAULT 1,
    fv_sucursal              TEXT,
    fv_codigo_producto       TEXT,
    fv_codigo_forma_pago     TEXT,
    fv_identificacion_vendedor TEXT,
    fv_codigo_iva            TEXT NOT NULL DEFAULT 'IVA19',
    formato_fecha            TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    actualizado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reglas de cuenta contable por NIT de proveedor (una empresa puede tener varias)
CREATE TABLE reglas_cuenta (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nit         TEXT NOT NULL,
    cuenta      TEXT NOT NULL,
    nota        TEXT,
    UNIQUE (empresa_id, nit)
);

-- Historial de importaciones del reporte DIAN (para trazabilidad y evitar reprocesar)
CREATE TABLE importaciones (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre_archivo  TEXT NOT NULL,
    total_documentos INTEGER NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentos individuales de cada importación (para detectar duplicados por CUFE)
CREATE TABLE documentos_importados (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    importacion_id  UUID NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
    cufe            TEXT NOT NULL,
    tipo_documento  TEXT NOT NULL,
    grupo           TEXT NOT NULL CHECK (grupo IN ('Emitido', 'Recibido')),
    destino         TEXT NOT NULL CHECK (destino IN ('comprobante', 'factura', 'excluir')),
    total           NUMERIC(18,2) NOT NULL DEFAULT 0,
    incluido        BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_documentos_cufe ON documentos_importados (cufe);
CREATE INDEX idx_empresas_usuario ON empresas (usuario_id);
CREATE INDEX idx_importaciones_empresa ON importaciones (empresa_id);
