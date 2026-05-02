(function () {
  const loginView = document.querySelector("#login-view");
  const panelView = document.querySelector("#panel-view");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");
  const logoutButton = document.querySelector("#logout-button");
  const refreshButton = document.querySelector("#refresh-button");
  const applicationCount = document.querySelector("#application-count");
  const applicationsBody = document.querySelector("#applications-body");
  const detailContent = document.querySelector("#detail-content");

  function formatDate(value) {
    return new Intl.DateTimeFormat("es-DO", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function money(value) {
    return new Intl.NumberFormat("es-DO", {
      style: "currency",
      currency: "DOP"
    }).format(Number(value || 0));
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      throw new Error(payload?.error || "No se pudo completar la solicitud.");
    }
    return payload;
  }

  function showLogin(message = "") {
    panelView.classList.add("hidden");
    loginView.classList.remove("hidden");
    loginMessage.textContent = message;
  }

  function showPanel() {
    loginView.classList.add("hidden");
    panelView.classList.remove("hidden");
  }

  function renderApplications(applications) {
    applicationsBody.innerHTML = "";
    applicationCount.textContent = `${applications.length} registros`;

    for (const item of applications) {
      const row = document.createElement("tr");
      row.dataset.id = item.id;
      row.innerHTML = `
        <td>${item.fullName || ""}</td>
        <td>${item.cedula || ""}</td>
        <td>${item.phone || ""}</td>
        <td>${money(item.initialAmount)}</td>
        <td>${item.province || ""}</td>
        <td>${formatDate(item.createdAt)}</td>
      `;
      row.addEventListener("click", () => {
        document.querySelectorAll("tbody tr").forEach((current) => current.classList.remove("selected"));
        row.classList.add("selected");
        loadDetail(item.id);
      });
      applicationsBody.append(row);
    }
  }

  function detailItem(label, value) {
    return `
      <div class="detail-item">
        <span class="detail-label">${label}</span>
        <span class="detail-value">${value || "No registrado"}</span>
      </div>
    `;
  }

  async function loadApplications() {
    const applications = await api("/api/admin/applications");
    renderApplications(applications);
  }

  async function loadDetail(id) {
    const item = await api(`/api/admin/applications/${id}`);
    detailContent.classList.remove("empty-state");
    detailContent.innerHTML = `
      <div class="detail-grid">
        ${detailItem("Nombre", item.fullName)}
        ${detailItem("Cedula", item.cedula)}
        ${detailItem("Telefono", item.phone)}
        ${detailItem("Inicial", money(item.initialAmount))}
        ${detailItem("Trabajo", item.jobName)}
        ${detailItem("Provincia", item.province)}
        ${detailItem("Direccion", item.address)}
        ${detailItem("Fecha", formatDate(item.createdAt))}
        ${
          item.photo
            ? `<img class="cedula-photo" src="${item.photo.url}" alt="Foto de cedula de ${item.fullName}">`
            : detailItem("Foto de cedula", "No registrada")
        }
      </div>
    `;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    const formData = new FormData(loginForm);

    try {
      await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password")
        })
      });
      loginForm.reset();
      showPanel();
      await loadApplications();
    } catch (error) {
      showLogin(error.message);
    }
  });

  logoutButton.addEventListener("click", async () => {
    await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => {});
    showLogin();
  });

  refreshButton.addEventListener("click", () => {
    loadApplications().catch((error) => showLogin(error.message));
  });

  api("/api/admin/me")
    .then((session) => {
      if (session.authenticated) {
        showPanel();
        return loadApplications();
      }
      showLogin();
      return null;
    })
    .catch(() => showLogin());
})();
