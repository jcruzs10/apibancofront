const API_BASE_URL = "https://bancocentroamericano.azurewebsites.net";
const LOCAL_AUTH_ENABLED = true;
const LOCAL_ADMIN_CREDENTIALS = [
    { credencial: "admin", password: "Admin123!" },
    { credencial: "admin", password: "admin" }
];

const state = {
    token: localStorage.getItem("token") || "",
    userName: localStorage.getItem("userName") || "",
    role: localStorage.getItem("role") || "USER",
    activeView: "view-login"
};

const viewButtons = document.querySelectorAll("[data-view]");
const views = document.querySelectorAll(".view");
const pageId = document.body ? document.body.dataset.page : "";
const statusSession = document.getElementById("status-session");
const statusIndicator = document.getElementById("status-indicator");
const tokenPreview = document.getElementById("token-preview");
const tokenPreviewAdmin = document.getElementById("token-preview-admin");
const roleLabel = document.getElementById("role-label");
const roleLabelAdmin = document.getElementById("role-label-admin");
const userLabel = document.getElementById("user-label");
const userLabelAdmin = document.getElementById("user-label-admin");
const logUser = document.getElementById("api-log");
const logAdmin = document.getElementById("api-log-admin");
const loginMessage = document.getElementById("login-message");

function setLoginMessage(message) {
    if (!loginMessage) return;
    if (!message) {
        loginMessage.textContent = "";
        loginMessage.classList.add("hidden");
        return;
    }
    loginMessage.textContent = message;
    loginMessage.classList.remove("hidden");
}

function isLocalAdmin(credencial, password) {
    return LOCAL_ADMIN_CREDENTIALS.some((item) =>
        item.credencial === credencial && item.password === password
    );
}

function setActiveView(viewId) {
    state.activeView = viewId;
    views.forEach((view) => view.classList.toggle("hidden", view.id !== viewId));
    viewButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewId));
}

function setSessionState(token) {
    state.token = token || "";
    localStorage.setItem("token", state.token);
    statusSession.textContent = state.token ? "Autenticado" : "Sin autenticar";
    statusIndicator.style.background = state.token ? "#d8b46a" : "#64748b";
    const previewText = state.token ? `${state.token.slice(0, 18)}...` : "---";
    if (tokenPreview) tokenPreview.textContent = previewText;
    if (tokenPreviewAdmin) tokenPreviewAdmin.textContent = previewText;
}

function setUserName(name) {
    state.userName = name || "";
    localStorage.setItem("userName", state.userName);
    if (userLabel) userLabel.textContent = state.userName || "---";
    if (userLabelAdmin) userLabelAdmin.textContent = state.userName || "---";
}

function setRole(role) {
    const normalized = (role || "USER").toUpperCase();
    const mapped = normalized === "CLIENTE" ? "USER" : normalized;
    state.role = mapped;
    localStorage.setItem("role", state.role);
    if (roleLabel) roleLabel.textContent = state.role;
    if (roleLabelAdmin) roleLabelAdmin.textContent = state.role;
}

function writeLog(target, title, payload) {
    if (!target) return;
    const content = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    target.textContent = `${title}\n${content}`;
}

function parseJwtRole(token) {
    if (!token || token.split(".").length < 2) return "";
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        const roleClaim = payload.role || payload.rol || payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];
        if (Array.isArray(roleClaim)) return roleClaim[0] || "";
        return roleClaim || "";
    } catch (error) {
        return "";
    }
}

async function requestApi(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (options.authRequired) {
        if (!state.token) {
            writeLog(logUser, "Token requerido", "Primero inicia sesion para usar este endpoint.");
            writeLog(logAdmin, "Token requerido", "Primero inicia sesion para usar este endpoint.");
            throw new Error("token-required");
        }
        headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get("content-type") || "";
    let data = null;
    if (contentType.includes("application/json")) {
        data = await response.json();
    } else {
        data = await response.text();
    }

    if (!response.ok) {
        const message = data || "Solicitud rechazada";
        writeLog(logUser, `Error ${response.status}`, message);
        writeLog(logAdmin, `Error ${response.status}`, message);
        throw new Error("request-failed");
    }

    return data || "OK";
}

function bindTabs() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const tabPanels = document.querySelectorAll(".tab-panel");
    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const target = button.dataset.tab;
            tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === target));
            tabPanels.forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== target));
        });
    });
}

function bindViewSwitch() {
    viewButtons.forEach((button) => {
        button.addEventListener("click", () => setActiveView(button.dataset.view));
    });
}

function bindAuthForms() {
    const loginForm = document.getElementById("form-login");
    const registerForm = document.getElementById("form-register");
    if (!loginForm || !registerForm) return;

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const credencial = document.getElementById("login-credencial").value.trim();
        const password = document.getElementById("login-password").value.trim();
        setLoginMessage("");

        if (LOCAL_AUTH_ENABLED && isLocalAdmin(credencial, password)) {
            setSessionState("local-admin");
            setRole("ADMIN");
            setUserName(credencial);
            setLoginMessage("Acceso local de administrador habilitado.");
            window.location.href = "admin.html";
            return;
        }

        try {
            const data = await requestApi("/api/Auth/login", {
                method: "POST",
                body: { credencial, password }
            });
            if (data && data.token) {
                setSessionState(data.token);
                const detected = parseJwtRole(data.token) || data.rol || "USER";
                setRole(detected);
            }
            setUserName(credencial);
            writeLog(logUser, "Login OK", data || "OK");
            writeLog(logAdmin, "Login OK", data || "OK");
            window.location.href = state.role === "ADMIN" ? "admin.html" : "usuario.html";
        } catch (error) {
            if (error.message !== "token-required") {
                writeLog(logUser, "Login fallido", "Verifica credenciales o disponibilidad de la API.");
                writeLog(logAdmin, "Login fallido", "Verifica credenciales o disponibilidad de la API.");
                setLoginMessage("No se pudo iniciar sesion. Verifica credenciales o la API.");
            }
        }
    });

    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {
            nombre: document.getElementById("reg-nombre").value.trim(),
            apellido: document.getElementById("reg-apellido").value.trim(),
            dpi: document.getElementById("reg-dpi").value.trim(),
            nit: document.getElementById("reg-nit").value.trim(),
            telefono: document.getElementById("reg-telefono").value.trim(),
            email: document.getElementById("reg-email").value.trim(),
            idTipoCuenta: document.getElementById("reg-tipo").value.trim()
        };

        try {
            const data = await requestApi("/api/Cuentahabientes/perfil", {
                method: "POST",
                body: payload
            });
            writeLog(logUser, "Perfil creado", data || "OK");
            writeLog(logAdmin, "Perfil creado", data || "OK");
        } catch (error) {
            if (error.message !== "token-required") {
                writeLog(logUser, "Registro fallido", "Revisa los datos y vuelve a intentar.");
                writeLog(logAdmin, "Registro fallido", "Revisa los datos y vuelve a intentar.");
            }
        }
    });
}

function bindOperations() {
    const userHandlers = [
        {
            id: "form-saldo",
            handler: async () => {
                const idCuenta = document.getElementById("saldo-id").value.trim();
                const data = await requestApi(`/api/Operaciones/saldo/${idCuenta}`, { authRequired: true });
                writeLog(logUser, "Saldo", data || "OK");
            }
        },
        {
            id: "form-deposito",
            handler: async () => {
                const payload = {
                    idCuenta: document.getElementById("deposito-id").value.trim(),
                    monto: document.getElementById("deposito-monto").value.trim(),
                    referencia: document.getElementById("deposito-ref").value.trim()
                };
                const data = await requestApi("/api/Operaciones/deposito", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Deposito OK", data || "OK");
            }
        },
        {
            id: "form-retiro",
            handler: async () => {
                const payload = {
                    idCuenta: document.getElementById("retiro-id").value.trim(),
                    monto: document.getElementById("retiro-monto").value.trim(),
                    referencia: document.getElementById("retiro-ref").value.trim()
                };
                const data = await requestApi("/api/Operaciones/retiro", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Retiro OK", data || "OK");
            }
        },
        {
            id: "form-transferir",
            handler: async () => {
                const payload = {
                    idCuentaOrigen: document.getElementById("trans-origen").value.trim(),
                    idCuentaDestino: document.getElementById("trans-destino").value.trim(),
                    monto: document.getElementById("trans-monto").value.trim(),
                    descripcion: document.getElementById("trans-desc").value.trim()
                };
                const data = await requestApi("/api/Operaciones/transferir", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Transferencia OK", data || "OK");
            }
        },
        {
            id: "form-asociar",
            handler: async () => {
                const payload = { idCuenta: document.getElementById("asociar-id").value.trim() };
                const data = await requestApi("/api/Cuentahabientes/tarjeta", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Tarjeta asociada", data || "OK");
            }
        },
        {
            id: "form-validar",
            handler: async () => {
                const payload = {
                    tipoServicio: document.getElementById("validar-tipo").value.trim(),
                    identificador: document.getElementById("validar-ident").value.trim()
                };
                const data = await requestApi("/api/Pagos/validar", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Validacion OK", data || "OK");
            }
        },
        {
            id: "form-pago",
            handler: async () => {
                const payload = {
                    numeroTarjeta: document.getElementById("pago-tarjeta").value.trim(),
                    pin: document.getElementById("pago-pin").value.trim(),
                    tipoServicio: document.getElementById("pago-tipo").value.trim(),
                    identificador: document.getElementById("pago-ident").value.trim(),
                    monto: document.getElementById("pago-monto").value.trim(),
                    referenciaCliente: document.getElementById("pago-ref").value.trim()
                };
                const data = await requestApi("/api/Pagos/ejecutar", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logUser, "Pago OK", data || "OK");
            }
        },
        {
            id: "form-deuda",
            handler: async () => {
                const tipo = document.getElementById("deuda-tipo").value.trim();
                const ident = document.getElementById("deuda-ident").value.trim();
                const data = await requestApi(`/api/Pagos/consultar-deuda/${tipo}/${ident}`, {
                    authRequired: true
                });
                writeLog(logUser, "Consulta deuda", data || "OK");
            }
        }
    ];

    const adminHandlers = [
        {
            id: "form-activar",
            handler: async () => {
                const payload = {
                    idCuenta: document.getElementById("activar-id").value.trim(),
                    montoDeposito: document.getElementById("activar-monto").value.trim()
                };
                const data = await requestApi("/api/Operaciones/activar-cuenta", {
                    method: "POST",
                    body: payload,
                    authRequired: true
                });
                writeLog(logAdmin, "Cuenta activada", data || "OK");
            }
        },
        {
            id: "form-bitacora",
            handler: async () => {
                const idCuenta = document.getElementById("bitacora-id").value.trim();
                const desde = document.getElementById("bitacora-desde").value;
                const hasta = document.getElementById("bitacora-hasta").value;
                const params = new URLSearchParams();
                if (desde) params.append("desde", new Date(desde).toISOString());
                if (hasta) params.append("hasta", new Date(hasta).toISOString());
                const suffix = params.toString() ? `?${params.toString()}` : "";
                const data = await requestApi(`/api/Bitacora/kardex/${idCuenta}${suffix}`, {
                    authRequired: true
                });
                writeLog(logAdmin, "Bitacora", data || "OK");
            }
        }
    ];

    [...userHandlers, ...adminHandlers].forEach(({ id, handler }) => {
        const form = document.getElementById(id);
        if (!form) return;
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                await handler();
            } catch (error) {}
        });
    });
}

function bindSessionControls() {
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            setSessionState("");
            setUserName("");
            setRole("USER");
            writeLog(logUser, "Sesion cerrada", "Token eliminado.");
            writeLog(logAdmin, "Sesion cerrada", "Token eliminado.");
            window.location.href = "login.html";
        });
    }

    const copyButtons = [document.getElementById("copy-token"), document.getElementById("copy-token-admin")];
    copyButtons.forEach((btn) => {
        if (!btn) return;
        btn.addEventListener("click", () => {
            if (!state.token) {
                writeLog(logUser, "Sin token", "Inicia sesion para copiar el token.");
                writeLog(logAdmin, "Sin token", "Inicia sesion para copiar el token.");
                return;
            }
            navigator.clipboard.writeText(state.token);
            writeLog(logUser, "Token copiado", "Token copiado al portapapeles.");
            writeLog(logAdmin, "Token copiado", "Token copiado al portapapeles.");
        });
    });
}

function init() {
    bindTabs();
    bindAuthForms();
    bindOperations();
    bindSessionControls();
    setSessionState(state.token);
    setUserName(state.userName);
    setRole(state.role);
        bindSectionMenu();
    if (pageId === "usuario" && (!state.token || state.role !== "USER")) {
        window.location.href = "login.html";
    }
    if (pageId === "admin" && (!state.token || state.role !== "ADMIN")) {
        window.location.href = "login.html";
    }
}

    function bindSectionMenu() {
        const sectionButtons = document.querySelectorAll(".menu-item[data-section]");
        const sections = document.querySelectorAll(".section[id]");
        if (!sectionButtons.length || !sections.length) return;

        sectionButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const targetId = button.dataset.section;
                sections.forEach((section) => {
                    section.classList.toggle("is-active", section.id === targetId);
                });
                sectionButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.section === targetId));
            });
        });
    }

init();