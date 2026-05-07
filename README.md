# Formulario Vende To

Aplicacion web para registrar solicitudes de clientes y revisarlas desde un panel privado del dealer.

## Variables de entorno

Antes de ejecutar en produccion, configura:

```text
DATABASE_URL=postgres://usuario:password@host:5432/base
ADMIN_USER=usuario-del-dealer
ADMIN_PASSWORD=contrasena-segura
PORT=3000
```

`PORT` es opcional. `DATABASE_URL`, `ADMIN_USER` y `ADMIN_PASSWORD` son necesarios para operar.

## Ejecutar

Instala dependencias:

```bash
npm install
```

Inicia el servidor:

```bash
npm start
```

Luego abre:

```text
http://localhost:3000
```

## Base de datos

El servidor usa PostgreSQL mediante `DATABASE_URL` y crea automaticamente estas tablas si no existen:

- `applications`: datos del cliente.
- `cedula_photos`: foto de cedula en `BYTEA`, relacionada a `applications`.

No se asume ninguna plataforma especifica de hosting. La plataforma elegida solo debe proporcionar PostgreSQL y permitir configurar variables de entorno.

## Panel del dealer

El panel privado esta en:

```text
/dealer-panel
```

La URL no aparece en la pagina publica y ademas requiere login con `ADMIN_USER` y `ADMIN_PASSWORD`. La sesion se mantiene activa con una cookie HTTP-only.

Desde el panel se puede:

- Buscar clientes por nombre, cedula o telefono.
- Filtrar solicitudes por status: pendiente, aprobado o rechazado.
- Abrir el detalle de cada cliente.
- Cambiar manualmente el status del financiamiento.
- Ver la foto de cedula asociada a la solicitud.

## Operacion

Como se guardan datos personales y fotos de cedula, usa HTTPS, contrasenas fuertes, backups de PostgreSQL y acceso limitado al servidor.
