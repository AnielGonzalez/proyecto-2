const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");

const html = readFileSync("index.html", "utf8");
const js = readFileSync("app.js", "utf8");
const css = readFileSync("styles.css", "utf8");
const server = readFileSync("server.js", "utf8");
const packageJson = readFileSync("package.json", "utf8");
const readme = readFileSync("README.md", "utf8");
const adminHtml = readFileSync("admin.html", "utf8");
const adminJs = readFileSync("admin.js", "utf8");
const adminCss = readFileSync("admin.css", "utf8");

test("muestra solo el logo Vende To", () => {
  assert.match(html, /assets\/vende-to-cropped\.png/);
  assert.match(html, /alt="Logo Vende To"/);
  assert.doesNotMatch(html, /dealer-logo-cropped\.png/);
  assert.doesNotMatch(html, /alt="Logo Dealer"/);
});

test("nombre, cedula, telefono e inicial son obligatorios", () => {
  const requiredIds = ["fullName", "cedula", "phone", "initialAmount"];
  const optionalIds = ["jobName", "address", "province", "cedulaPhoto"];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]*?required`), `falta required en ${id}`);
    assert.match(html, new RegExp(`for="${id}"`), `falta label para ${id}`);
  }

  for (const id of optionalIds) {
    const fieldBlock = html.match(new RegExp(`id="${id}"[\\s\\S]*?(?:>|</textarea>)`));
    assert.ok(fieldBlock, `falta campo ${id}`);
    assert.doesNotMatch(fieldBlock[0], /required/, `${id} no debe ser obligatorio`);
  }

  assert.doesNotMatch(html, /maritalStatus/);
  assert.doesNotMatch(html, /Estado civil/);
  assert.match(html, /id="cedulaPhoto"[\s\S]*?type="file"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp,image\/heic,image\/heif"/);
  assert.match(html, /pattern="\^\\d\{3\}-\?\\d\{7\}-\?\\d\{1\}\$"/);
  assert.match(html, /pattern="\^\\d\{3\}-\?\\d\{3\}-\?\\d\{4\}\$"/);
});

test("ofrece campo de inicial y provincias dominicanas", () => {
  const provinceOptions = html.match(/<option>(Azua|Santiago|Santo Domingo|Distrito Nacional|Valverde)<\/option>/g) || [];

  assert.match(html, /<label for="initialAmount">Inicial<\/label>/);
  assert.match(html, /id="initialAmount"[\s\S]*?type="number"/);
  assert.match(html, /name="initialAmount"/);
  assert.doesNotMatch(html, /salaryRange/);
  assert.doesNotMatch(html, /Rango salarial/);
  assert.equal(provinceOptions.length, 5, "debe incluir provincias clave");
  assert.match(html, /<option>La Altagracia<\/option>/);
  assert.match(html, /<option>San Pedro de Macoris<\/option>/);
});

test("el javascript valida, resume y limpia el formulario", () => {
  assert.match(js, /function validateForm\(\)/);
  assert.match(js, /const fields = \["fullName", "cedula", "phone", "initialAmount"\]/);
  assert.match(js, /async function saveApplication\(formData\)/);
  assert.match(js, /fetch\("\/api\/applications"/);
  assert.match(js, /event\.preventDefault\(\)/);
  assert.match(js, /new FormData\(form\)/);
  assert.match(js, /data\.jobName = normalize\(data\.jobName \|\| ""\)/);
  assert.match(js, /data\.initialAmount = normalize\(data\.initialAmount \|\| ""\)/);
  assert.doesNotMatch(js, /maritalStatus/);
  assert.match(js, /formatSummary\(data\)/);
  assert.match(js, /La informacion fue guardada correctamente/);
  assert.match(js, /form\.reset\(\)/);
});

test("incluye servidor para guardar solicitudes y fotos", () => {
  assert.match(packageJson, /"start": "node server\.js"/);
  assert.match(packageJson, /"pg":/);
  assert.match(server, /pathname === "\/api\/applications"/);
  assert.match(server, /DATABASE_URL/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS applications/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS cedula_photos/);
  assert.match(server, /status TEXT NOT NULL DEFAULT 'pendiente'/);
  assert.match(server, /applications_status_check/);
  assert.match(server, /BYTEA NOT NULL/);
  assert.match(server, /REFERENCES applications\(id\) ON DELETE CASCADE/);
  assert.match(server, /validateApplication\(fields\)/);
  assert.match(server, /INSERT INTO applications/);
  assert.match(server, /INSERT INTO cedula_photos/);
  assert.match(readme, /DATABASE_URL/);
  assert.match(readme, /PostgreSQL/);
});

test("incluye panel privado del dealer", () => {
  assert.match(server, /const ADMIN_PATH = "\/dealer-panel"/);
  assert.match(server, /ADMIN_USER/);
  assert.match(server, /ADMIN_PASSWORD/);
  assert.match(server, /SESSION_COOKIE/);
  assert.match(server, /\/api\/admin\/login/);
  assert.match(server, /\/api\/admin\/applications/);
  assert.match(server, /handleAdminApplicationDetail/);
  assert.match(server, /handleAdminApplicationPhoto/);
  assert.match(server, /handleAdminApplicationStatus/);
  assert.match(server, /searchParams\.get\("search"\)/);
  assert.match(server, /searchParams\.get\("status"\)/);
  assert.match(server, /ILIKE/);
  assert.match(server, /PATCH/);
  assert.match(adminHtml, /id="login-view"/);
  assert.match(adminHtml, /id="panel-view"/);
  assert.match(adminHtml, /id="applications-body"/);
  assert.match(adminHtml, /id="search-input"/);
  assert.match(adminHtml, /id="status-filter"/);
  assert.match(adminHtml, /Aprobado/);
  assert.match(adminHtml, /Rechazado/);
  assert.match(adminJs, /\/api\/admin\/login/);
  assert.match(adminJs, /\/api\/admin\/applications/);
  assert.match(adminJs, /currentListUrl/);
  assert.match(adminJs, /updateStatus/);
  assert.match(adminJs, /status-select/);
  assert.match(adminJs, /credentials: "include"/);
  assert.match(adminCss, /table/);
  assert.match(adminCss, /status-pill/);
});

test("la pagina es responsiva y visualmente accesible", () => {
  assert.match(html, /<meta name="viewport"/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /:focus/);
  assert.match(css, /aria-invalid/);
  assert.match(css, /--accent: #ff0b0b/);
  assert.match(css, /--ink: #080808/);
});
