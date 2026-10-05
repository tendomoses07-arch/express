// Kola Express — Dedicated Admin API Client
// Handles authentication, role verification, and all administrative requests

const ADMIN_API_BASE = '/api';

function getAdminToken() {
  return localStorage.getItem('kola_admin_token');
}

function setAdminToken(token) {
  if (token) {
    localStorage.setItem('kola_admin_token', token);
  } else {
    localStorage.removeItem('kola_admin_token');
  }
}

function getAdminUser() {
  const u = localStorage.getItem('kola_admin_user');
  try {
    return u ? JSON.parse(u) : null;
  } catch (e) {
    return null;
  }
}

function setAdminUser(user) {
  if (user) {
    localStorage.setItem('kola_admin_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('kola_admin_user');
  }
}

async function adminRequest(endpoint, options = {}) {
  const token = getAdminToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Session expired or unauthenticated
    setAdminToken(null);
    setAdminUser(null);
    if (window.adminApp && typeof window.adminApp.handleSessionExpired === 'function') {
      window.adminApp.handleSessionExpired();
    }
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

const adminApi = {
  // Auth
  auth: {
    async login(identifier, password) {
      const res = await adminRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });

      if (!res.user || res.user.role !== 'admin') {
        throw new Error('Access Denied: This portal is strictly for authorized Kola Express administrators.');
      }

      setAdminToken(res.token);
      setAdminUser(res.user);
      return res;
    },
    async me() {
      return await adminRequest('/admin/me');
    },
    logout() {
      setAdminToken(null);
      setAdminUser(null);
    },
    getUser: getAdminUser,
    getToken: getAdminToken,
    isAuthenticated() {
      const token = getAdminToken();
      const user = getAdminUser();
      return !!(token && user && user.role === 'admin');
    }
  },

  // Dashboard Stats & Activity Stream
  dashboard: {
    async getStats() {
      return await adminRequest('/admin/stats');
    },
    async getEvents() {
      return await adminRequest('/admin/events');
    }
  },

  // Deliveries Management
  deliveries: {
    async list(status = 'all', search = '') {
      return await adminRequest(`/admin/deliveries?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`);
    },
    async get(deliveryId) {
      return await adminRequest(`/admin/deliveries/${deliveryId}`);
    },
    async assignCourier(deliveryId, courierId) {
      return await adminRequest(`/admin/deliveries/${deliveryId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ courier_id: courierId })
      });
    },
    async updateStatus(deliveryId, status, note = '') {
      return await adminRequest(`/admin/deliveries/${deliveryId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note })
      });
    },
    async cancel(deliveryId, reason) {
      return await adminRequest(`/admin/deliveries/${deliveryId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async getHandoverAudit(deliveryId) {
      return await adminRequest(`/admin/deliveries/${deliveryId}/handover-audit`);
    },
    async correctHandover(deliveryId, action, reason) {
      return await adminRequest(`/admin/deliveries/${deliveryId}/correct-handover`, {
        method: 'POST',
        body: JSON.stringify({ action, reason })
      });
    }
  },

  // Courier Fleet Management
  couriers: {
    async list() {
      return await adminRequest('/admin/couriers');
    },
    async create(courierData) {
      return await adminRequest('/admin/couriers', {
        method: 'POST',
        body: JSON.stringify(courierData)
      });
    },
    async toggleStatus(courierId) {
      return await adminRequest(`/admin/couriers/${courierId}/toggle`, {
        method: 'POST'
      });
    }
  },

  // Customers Management
  customers: {
    async list(search = '') {
      return await adminRequest(`/admin/customers?search=${encodeURIComponent(search)}`);
    },
    async get(customerId) {
      return await adminRequest(`/admin/customers/${customerId}`);
    }
  },

  // Payments & Financial Ledger
  finance: {
    async getPayments(status = 'all') {
      return await adminRequest(`/admin/payments?status=${encodeURIComponent(status)}`);
    },
    async getReports() {
      return await adminRequest('/admin/reports');
    }
  },

  // Pricing Rules (Super Admin)
  pricing: {
    async get() {
      return await adminRequest('/admin/pricing');
    },
    async update(pricingData) {
      return await adminRequest('/admin/pricing', {
        method: 'POST',
        body: JSON.stringify(pricingData)
      });
    }
  },

  // Audit Logs (Super Admin)
  audit: {
    async getLogs() {
      return await adminRequest('/admin/logs');
    }
  },

  // Admin Staff Management (Super Admin)
  staff: {
    async list() {
      return await adminRequest('/admin/users');
    },
    async create(staffData) {
      return await adminRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify(staffData)
      });
    },
    async toggleStatus(adminId) {
      return await adminRequest(`/admin/users/${adminId}/toggle`, {
        method: 'POST'
      });
    }
  }
};

window.kolaAdminApi = adminApi;
