(function () {
  const form = document.querySelector("#user-form");
  const result = document.querySelector("#form-result");

  const messages = {
    fullName: "Escribe el nombre completo.",
    cedula: "Usa una cedula valida: 000-0000000-0.",
    phone: "Usa un telefono valido: 809-000-0000.",
    initialAmount: "Escribe el monto que tiene de inicial."
  };

  function getField(name) {
    return form.elements[name];
  }

  function setError(name, message) {
    const error = document.querySelector(`#${name}-error`);
    if (error) {
      error.textContent = message || "";
    }

    const field = getField(name);
    if (!field) {
      return;
    }

    if (field instanceof RadioNodeList) {
      Array.from(field).forEach((item) => item.setAttribute("aria-invalid", Boolean(message)));
      return;
    }

    field.setAttribute("aria-invalid", Boolean(message));
  }

  function normalize(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function validateField(name) {
    const field = getField(name);
    const valid = field instanceof RadioNodeList ? field.value !== "" : field.checkValidity();
    setError(name, valid ? "" : messages[name]);
    return valid;
  }

  function validateForm() {
    const fields = ["fullName", "cedula", "phone", "initialAmount"];
    return fields.every(validateField);
  }

  function formatSummary(data) {
    const details = [];
    if (data.jobName) {
      details.push(`Trabajo: ${data.jobName}`);
    }
    if (data.province) {
      details.push(`Provincia: ${data.province}`);
    }
    if (data.initialAmount) {
      details.push(`Inicial: RD$${data.initialAmount}`);
    }
    return `Registro listo para ${data.fullName}.${details.length ? ` ${details.join(". ")}.` : ""}`;
  }

  async function saveApplication(formData) {
    const response = await fetch("/api/applications", {
      method: "POST",
      body: formData
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo guardar la informacion.");
    }
    return payload;
  }

  form.addEventListener("input", (event) => {
    if (event.target.name) {
      validateField(event.target.name);
    }
  });

  form.addEventListener("change", (event) => {
    if (event.target.name) {
      validateField(event.target.name);
    }
  });

  form.addEventListener("reset", () => {
    Object.keys(messages).forEach((name) => setError(name, ""));
    result.classList.remove("show");
    result.textContent = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    result.classList.remove("show");

    if (!validateForm()) {
      result.textContent = "";
      return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.fullName = normalize(data.fullName);
    data.jobName = normalize(data.jobName || "");
    data.address = normalize(data.address || "");
    data.initialAmount = normalize(data.initialAmount || "");

    try {
      await saveApplication(formData);
      form.reset();
      result.textContent = `${formatSummary(data)} La informacion fue guardada correctamente.`;
      result.classList.add("show");
    } catch (error) {
      result.textContent = error.message;
      result.classList.add("show");
    }
  });
})();
