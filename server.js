const http = require("node:http");
const { randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const NORMALIZED_ROOT = path.normalize(ROOT);
const ADMIN_PATH = "/dealer-panel";
const SESSION_COOKIE = "dealer_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const sessions = new Map();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sanitizeFilename(filename) {
  return path.basename(filename || "cedula").replace(/[^a-z0-9._-]/gi, "-");
}

function getEnvCredential(name) {
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

function safeCompare(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separator = cookie.indexOf("=");
        return [cookie.slice(0, separator), decodeURIComponent(cookie.slice(separator + 1))];
      })
  );
}

function createSession(res) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}`
  );
  return token;
}

function clearSession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function isAuthenticated(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  const expiresAt = token ? sessions.get(token) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    if (token) {
      sessions.delete(token);
    }
    return false;
  }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function requireAdmin(req, res) {
  if (isAuthenticated(req)) {
    return true;
  }
  sendJson(res, 401, { error: "No autenticado." });
  return false;
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no esta configurada.");
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      full_name TEXT NOT NULL,
      cedula TEXT NOT NULL,
      phone TEXT NOT NULL,
      initial_amount NUMERIC(12, 2) NOT NULL,
      job_name TEXT,
      province TEXT,
      address TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cedula_photos (
      id UUID PRIMARY KEY,
      application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
      original_name TEXT,
      content_type TEXT,
      data BYTEA NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications (created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cedula_photos_application_id ON cedula_photos (application_id);
  `);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readRequestBody(req);
  if (!body.length) {
    return {};
  }
  return JSON.parse(body.toString("utf8"));
}

function parseContentDisposition(value) {
  const result = {};
  for (const part of value.split(";")) {
    const [key, rawValue] = part.trim().split("=");
    if (rawValue) {
      result[key] = rawValue.replace(/^"|"$/g, "");
    }
  }
  return result;
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) {
    throw new Error("Formulario invalido.");
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const body = buffer.toString("binary");
  const parts = body.split(boundary).slice(1, -1);
  const fields = {};
  const files = [];

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const separatorIndex = part.indexOf("\r\n\r\n");
    if (separatorIndex === -1) {
      continue;
    }

    const rawHeaders = part.slice(0, separatorIndex);
    const content = part.slice(separatorIndex + 4);
    const headers = Object.fromEntries(
      rawHeaders.split("\r\n").map((line) => {
        const [name, ...rest] = line.split(":");
        return [name.toLowerCase(), rest.join(":").trim()];
      })
    );
    const disposition = parseContentDisposition(headers["content-disposition"] || "");

    if (!disposition.name) {
      continue;
    }

    if (disposition.filename) {
      const contentBuffer = Buffer.from(content, "binary");
      if (contentBuffer.length > 0) {
        files.push({
          fieldName: disposition.name,
          originalName: sanitizeFilename(disposition.filename),
          contentType: headers["content-type"] || "application/octet-stream",
          buffer: contentBuffer
        });
      }
      continue;
    }

    fields[disposition.name] = Buffer.from(content, "binary").toString("utf8").trim();
  }

  return { fields, files };
}

function validateApplication(fields) {
  const required = ["fullName", "cedula", "phone", "initialAmount"];
  for (const field of required) {
    if (!fields[field]) {
      return `El campo ${field} es obligatorio.`;
    }
  }

  if (!/^\d{3}-?\d{7}-?\d{1}$/.test(fields.cedula)) {
    return "La cedula no tiene un formato valido.";
  }

  if (!/^\d{3}-?\d{3}-?\d{4}$/.test(fields.phone)) {
    return "El telefono no tiene un formato valido.";
  }

  if (!Number.isFinite(Number(fields.initialAmount)) || Number(fields.initialAmount) < 0) {
    return "La inicial debe ser cero o mayor.";
  }

  return "";
}

async function handleApplication(req, res) {
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    sendJson(res, 415, { error: "El formulario debe enviarse como multipart/form-data." });
    return;
  }

  const body = await readRequestBody(req);
  const { fields, files } = parseMultipart(body, req.headers["content-type"]);
  const error = validateApplication(fields);

  if (error) {
    sendJson(res, 400, { error });
    return;
  }

  const id = randomUUID();
  const cedulaPhoto = files.find((file) => file.fieldName === "cedulaPhoto");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO applications
        (id, full_name, cedula, phone, initial_amount, job_name, province, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        fields.fullName,
        fields.cedula,
        fields.phone,
        fields.initialAmount,
        fields.jobName || "",
        fields.province || "",
        fields.address || ""
      ]
    );

    if (cedulaPhoto) {
      await client.query(
        `INSERT INTO cedula_photos
          (id, application_id, original_name, content_type, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), id, cedulaPhoto.originalName, cedulaPhoto.contentType, cedulaPhoto.buffer]
      );
    }

    await client.query("COMMIT");
    sendJson(res, 201, { id, message: "Solicitud guardada correctamente." });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleAdminLogin(req, res) {
  const adminUser = getEnvCredential("ADMIN_USER");
  const adminPassword = getEnvCredential("ADMIN_PASSWORD");

  if (!adminUser || !adminPassword) {
    sendJson(res, 503, { error: "ADMIN_USER y ADMIN_PASSWORD deben estar configurados." });
    return;
  }

  const body = await readJson(req);
  const validUser = safeCompare(String(body.username || ""), adminUser);
  const validPassword = safeCompare(String(body.password || ""), adminPassword);

  if (!validUser || !validPassword) {
    sendJson(res, 401, { error: "Usuario o contrasena incorrectos." });
    return;
  }

  createSession(res);
  sendJson(res, 200, { ok: true });
}

async function handleAdminLogout(req, res) {
  clearSession(req, res);
  sendJson(res, 200, { ok: true });
}

async function handleAdminMe(req, res) {
  sendJson(res, 200, { authenticated: isAuthenticated(req) });
}

async function handleAdminApplications(req, res) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await pool.query(`
    SELECT
      a.id,
      a.created_at,
      a.full_name,
      a.cedula,
      a.phone,
      a.initial_amount,
      a.province,
      EXISTS (
        SELECT 1 FROM cedula_photos p WHERE p.application_id = a.id
      ) AS has_photo
    FROM applications a
    ORDER BY a.created_at DESC
  `);

  sendJson(
    res,
    200,
    result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      fullName: row.full_name,
      cedula: row.cedula,
      phone: row.phone,
      initialAmount: row.initial_amount,
      province: row.province,
      hasPhoto: row.has_photo
    }))
  );
}

async function handleAdminApplicationDetail(req, res, id) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await pool.query(
    `
      SELECT
        a.id,
        a.created_at,
        a.full_name,
        a.cedula,
        a.phone,
        a.initial_amount,
        a.job_name,
        a.province,
        a.address,
        p.id AS photo_id,
        p.original_name,
        p.content_type
      FROM applications a
      LEFT JOIN cedula_photos p ON p.application_id = a.id
      WHERE a.id = $1
      LIMIT 1
    `,
    [id]
  );

  if (!result.rows.length) {
    sendJson(res, 404, { error: "Solicitud no encontrada." });
    return;
  }

  const row = result.rows[0];
  sendJson(res, 200, {
    id: row.id,
    createdAt: row.created_at,
    fullName: row.full_name,
    cedula: row.cedula,
    phone: row.phone,
    initialAmount: row.initial_amount,
    jobName: row.job_name,
    province: row.province,
    address: row.address,
    photo: row.photo_id
      ? {
          id: row.photo_id,
          originalName: row.original_name,
          contentType: row.content_type,
          url: `/api/admin/applications/${row.id}/photo`
        }
      : null
  });
}

async function handleAdminApplicationPhoto(req, res, id) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const result = await pool.query(
    `SELECT original_name, content_type, data FROM cedula_photos WHERE application_id = $1 LIMIT 1`,
    [id]
  );

  if (!result.rows.length) {
    sendText(res, 404, "Foto no encontrada.");
    return;
  }

  const row = result.rows[0];
  res.writeHead(200, {
    "Content-Type": row.content_type || "application/octet-stream",
    "Content-Disposition": `inline; filename="${sanitizeFilename(row.original_name)}"`,
    "Cache-Control": "private, no-store"
  });
  res.end(row.data);
}

async function serveStatic(req, res) {
  const requestedPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const routePath = requestedPath === ADMIN_PATH ? "/admin.html" : requestedPath;
  const safeRequestPath = routePath.replace(/^[/\\]+/, "");
  const filePath = path.normalize(path.join(ROOT, safeRequestPath));

  if (filePath !== NORMALIZED_ROOT && !filePath.startsWith(`${NORMALIZED_ROOT}${path.sep}`)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function routeAdminApplication(req, res, pathname) {
  const detailMatch = pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})$/i);
  if (detailMatch && req.method === "GET") {
    return handleAdminApplicationDetail(req, res, detailMatch[1]);
  }

  const photoMatch = pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})\/photo$/i);
  if (photoMatch && req.method === "GET") {
    return handleAdminApplicationPhoto(req, res, photoMatch[1]);
  }

  return null;
}

async function handleRequest(req, res) {
  const { pathname } = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "POST" && pathname === "/api/applications") {
    return handleApplication(req, res);
  }
  if (req.method === "POST" && pathname === "/api/admin/login") {
    return handleAdminLogin(req, res);
  }
  if (req.method === "POST" && pathname === "/api/admin/logout") {
    return handleAdminLogout(req, res);
  }
  if (req.method === "GET" && pathname === "/api/admin/me") {
    return handleAdminMe(req, res);
  }
  if (req.method === "GET" && pathname === "/api/admin/applications") {
    return handleAdminApplications(req, res);
  }

  const adminApplicationRoute = routeAdminApplication(req, res, pathname);
  if (adminApplicationRoute) {
    return adminApplicationRoute;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return serveStatic(req, res);
  }

  sendJson(res, 405, { error: "Metodo no permitido." });
}

async function main() {
  await initDatabase();
  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(() => handleRequest(req, res))
      .catch((error) => {
        console.error(error);
        sendJson(res, 500, { error: "Error interno del servidor." });
      });
  });

  server.listen(PORT, () => {
    console.log(`Servidor listo en http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
