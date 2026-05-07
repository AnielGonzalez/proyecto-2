(function () {
  const loginView = document.querySelector("#login-view");
  const panelView = document.querySelector("#panel-view");
  const loginForm = document.querySelector("#login-form");
  const loginMessage = document.querySelector("#login-message");
  const logoutButton = document.querySelector("#logout-button");
  const refreshButton = document.querySelector("#refresh-button");
  const searchInput = document.querySelector("#search-input");
  const statusFilter = document.querySelector("#status-filter");
  const applicationCount = document.querySelector("#application-count");
  const applicationsBody = document.querySelector("#applications-body");
  const detailContent = document.querySelector("#detail-content");
  let selectedApplicationId = "";

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

  function statusLabel(value) {
    const labels = {
      pendiente: "Pendiente",
      aprobado: "Aprobado",
      rechazado: "Rechazado"
    };
    return labels[value] || labels.pendiente;
  }

  function statusClass(value) {
    return `status-pill ${value || "pendiente"}`;
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
        <td><span class="${statusClass(item.status)}">${statusLabel(item.status)}</span></td>
        <td>${formatDate(item.createdAt)}</td>
      `;
      row.addEventListener("click", () => {
        selectedApplicationId = item.id;
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

  function currentListUrl() {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();
    const status = statusFilter.value;

    if (search) {
      params.set("search", search);
    }
    if (status) {
      params.set("status", status);
    }

    const query = params.toString();
    return `/api/admin/applications${query ? `?${query}` : ""}`;
  }

  async function loadApplications() {
    const applications = await api(currentListUrl());
    renderApplications(applications);
  }

  async function updateStatus(id, status) {
    await api(`/api/admin/applications/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadApplications();
    await loadDetail(id);
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
        <div class="detail-item">
          <label class="detail-label" for="status-select">Status</label>
          <select id="status-select" class="status-select">
            <option value="pendiente" ${item.status === "pendiente" ? "selected" : ""}>Pendiente</option>
            <option value="aprobado" ${item.status === "aprobado" ? "selected" : ""}>Aprobado</option>
            <option value="rechazado" ${item.status === "rechazado" ? "selected" : ""}>Rechazado</option>
          </select>
        </div>
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

    document.querySelector("#status-select").addEventListener("change", (event) => {
      updateStatus(item.id, event.target.value).catch((error) => {
        detailContent.innerHTML = `<div class="empty-state">${error.message}</div>`;
      });
    });
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

  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchInput.searchTimer);
    searchInput.searchTimer = window.setTimeout(() => {
      loadApplications().catch((error) => showLogin(error.message));
    }, 250);
  });

  statusFilter.addEventListener("change", () => {
    loadApplications().catch((error) => showLogin(error.message));
    if (selectedApplicationId) {
      detailContent.classList.add("empty-state");
      detailContent.textContent = "Selecciona un registro para ver la informacion completa.";
      selectedApplicationId = "";
    }
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
