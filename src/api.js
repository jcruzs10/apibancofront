import { API_URL } from './config.js';

const ROLE_CLAIMS = [
  'role',
  'roles',
  'rol',
  'perfil',
  'tipoUsuario',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
];

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;

  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = atob(normalizedPayload);
    const json = decodeURIComponent(
      decoded
        .split('')
        .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );

    return JSON.parse(json);
  } catch (error) {
    console.warn('No se pudo leer el payload del token JWT:', error);
    return null;
  }
}

function normalizeRole(rawRole) {
  const role = Array.isArray(rawRole) ? rawRole[0] : rawRole;
  if (!role) return null;

  const normalizedRole = String(role).trim().toLowerCase();

  if (['admin', 'administrador', 'administrator'].includes(normalizedRole)) {
    return 'admin';
  }

  if (['usuario', 'user', 'cliente', 'client'].includes(normalizedRole)) {
    return 'usuario';
  }

  return null;
}

function getRoleFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  for (const claim of ROLE_CLAIMS) {
    const role = normalizeRole(payload[claim]);
    if (role) return role;
  }

  return null;
}

function isTokenExpired(payload) {
  if (!payload?.exp) return false;
  return Date.now() >= Number(payload.exp) * 1000;
}

function buildSession({ credencial, token, response }) {
  const payload = decodeJwtPayload(token);
  const tokenRole = getRoleFromPayload(payload);
  const responseRole = normalizeRole(response?.role)
    || normalizeRole(response?.rol)
    || normalizeRole(response?.tipoUsuario);
  const role = tokenRole || responseRole;

  if (!role) {
    throw new Error('La API no devolvio un rol valido para esta sesion.');
  }

  if (isTokenExpired(payload)) {
    throw new Error('La sesion expiro. Inicie sesion nuevamente.');
  }

  return {
    credencial,
    token,
    role
  };
}

function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const url = `${API_URL}${path}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorMsg = `Error del servidor (${response.status})`;
      try {
        const errData = await response.json();
        errorMsg = errData.message || errData.title || errData.error || errorMsg;
      } catch (e) {
        try {
          const errText = await response.text();
          if (errText) errorMsg = errText;
        } catch (_) {}
      }
      throw new Error(errorMsg);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    
    return await response.text();
  } catch (error) {
    console.error(`Error en API ${path}:`, error);
    throw error;
  }
}

export const BancoAPI = {
  // --- AUTH ---
  async login(credencial, password) {
    const response = await request('/api/Auth/login', {
      method: 'POST',
      body: JSON.stringify({ credencial, password })
    });
    
    const token = response?.token || response?.accessToken || response?.jwt || null;
    const session = buildSession({ credencial, token, response });

    if (session.token) {
      localStorage.setItem('token', session.token);
    }

    localStorage.setItem('credencial', session.credencial);
    localStorage.setItem('rol', session.role);
    
    return {
      ...response,
      credencial: session.credencial,
      role: session.role
    };
  },

  getStoredSession() {
    const credencial = localStorage.getItem('credencial');
    const token = localStorage.getItem('token');
    const storedRole = localStorage.getItem('rol');

    if (!credencial) return null;

    try {
      return buildSession({
        credencial,
        token,
        response: { role: storedRole }
      });
    } catch (error) {
      console.warn('Sesion local invalida:', error);
      this.logout();
      return null;
    }
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('credencial');
    localStorage.removeItem('rol');
  },

  // --- CUENTAHABIENTES ---
  async crearCuentahabiente(dpi, nit, nombre, apellido, telefono, email, idTipoCuenta) {
    return await request('/api/Cuentahabientes/perfil', {
      method: 'POST',
      body: JSON.stringify({
        dpi,
        nit,
        nombre,
        apellido,
        telefono: telefono || null,
        email: email || null,
        idTipoCuenta: parseInt(idTipoCuenta, 10)
      })
    });
  },

  async asociarTarjeta(idCuenta) {
    return await request('/api/Cuentahabientes/tarjeta', {
      method: 'POST',
      body: JSON.stringify({
        idCuenta: parseInt(idCuenta, 10)
      })
    });
  },

  // --- OPERACIONES ---
  async obtenerSaldo(idCuenta) {
    return await request(`/api/Operaciones/saldo/${idCuenta}`);
  },

  async deposito(idCuenta, monto, referencia) {
    return await request('/api/Operaciones/deposito', {
      method: 'POST',
      body: JSON.stringify({
        idCuenta: parseInt(idCuenta, 10),
        monto: parseFloat(monto),
        referencia: referencia || null
      })
    });
  },

  async retiro(idCuenta, monto, referencia) {
    return await request('/api/Operaciones/retiro', {
      method: 'POST',
      body: JSON.stringify({
        idCuenta: parseInt(idCuenta, 10),
        monto: parseFloat(monto),
        referencia: referencia || null
      })
    });
  },

  async activarCuenta(idCuenta, montoDeposito) {
    return await request('/api/Operaciones/activar-cuenta', {
      method: 'POST',
      body: JSON.stringify({
        idCuenta: parseInt(idCuenta, 10),
        montoDeposito: parseFloat(montoDeposito)
      })
    });
  },

  async transferir(idCuentaOrigen, idCuentaDestino, monto, descripcion) {
    return await request('/api/Operaciones/transferir', {
      method: 'POST',
      body: JSON.stringify({
        idCuentaOrigen: parseInt(idCuentaOrigen, 10),
        idCuentaDestino: parseInt(idCuentaDestino, 10),
        monto: parseFloat(monto),
        descripcion: descripcion
      })
    });
  },

  // --- PAGOS ---
  async consultarDeuda(tipoServicio, identificador) {
    return await request(`/api/Pagos/consultar-deuda/${tipoServicio}/${identificador}`);
  },

  async validarPago(tipoServicio, identificador) {
    return await request('/api/Pagos/validar', {
      method: 'POST',
      body: JSON.stringify({
        tipoServicio: parseInt(tipoServicio, 10),
        identificador
      })
    });
  },

  async ejecutarPago(numeroTarjeta, pin, tipoServicio, identificador, monto, referenciaCliente) {
    return await request('/api/Pagos/ejecutar', {
      method: 'POST',
      body: JSON.stringify({
        numeroTarjeta,
        pin,
        tipoServicio: parseInt(tipoServicio, 10),
        identificador,
        monto: parseFloat(monto),
        referenciaCliente: referenciaCliente || null
      })
    });
  },

  // --- BITACORA Y DIAGNOSTICOS ---
  async obtenerKardex(idCuenta, desde = null, hasta = null) {
    let query = '';
    const params = [];
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`);
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`);
    if (params.length > 0) query = `?${params.join('&')}`;

    return await request(`/api/Bitacora/kardex/${idCuenta}${query}`);
  },

  async obtenerIntegraciones() {
    return await request('/api/diagnostico/integraciones');
  }
};