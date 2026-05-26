import { API_URL } from './config.js';

// Auxiliar para obtener el token almacenado
function getAuthHeader() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Auxiliar centralizado para realizar las peticiones HTTP
async function request(path, options = {}) {
  const url = `${API_URL}${path}`;
  
  // Fusionar los headers por defecto, de autenticación y los personalizados
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
    
    // Si la respuesta no es OK, intentamos parsear el error que devuelve la API
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

    // Algunas peticiones de éxito no devuelven contenido (204) o devuelven texto plano
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
    
    // Si el login fue exitoso y devolvió datos (por ejemplo, un token)
    if (response && response.token) {
      localStorage.setItem('token', response.token);
    }
    // Guardar también la credencial para saber quién inició sesión
    localStorage.setItem('credencial', credencial);
    
    return response;
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('credencial');
    localStorage.removeItem('role');
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
