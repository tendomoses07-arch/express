// Kola Express Client API Helper Module

const API_BASE = '/api';

function getStoredToken() {
  return localStorage.getItem('kola_token');
}

function setStoredToken(token) {
  if (token) {
    localStorage.setItem('kola_token', token);
  } else {
    localStorage.removeItem('kola_token');
  }
}

function getStoredUser() {
  const u = localStorage.getItem('kola_user');
  try {
    return u ? JSON.parse(u) : null;
  } catch (e) {
    return null;
  }
}

function setStoredUser(user) {
  if (user) {
    localStorage.setItem('kola_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('kola_user');
  }
}

async function request(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

const api = {
  // Auth
  auth: {
    async register(userData) {
      const res = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData)
      });
      setStoredToken(res.token);
      setStoredUser(res.user);
      return res;
    },
    async login(identifier, password) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });
      setStoredToken(res.token);
      setStoredUser(res.user);
      return res;
    },
    async me() {
      return await request('/auth/me');
    },
    logout() {
      setStoredToken(null);
      setStoredUser(null);
    },
    getUser: getStoredUser,
    getToken: getStoredToken
  },

  // Pricing
  pricing: {
    async getRules() {
      return await request('/pricing');
    },
    async calculateQuote(quoteData) {
      return await request('/deliveries/quote', {
        method: 'POST',
        body: JSON.stringify(quoteData)
      });
    }
  },

  // Deliveries
  deliveries: {
    async create(deliveryData) {
      return await request('/deliveries', {
        method: 'POST',
        body: JSON.stringify(deliveryData)
      });
    },
    async get(trackingOrId) {
      return await request(`/deliveries/${encodeURIComponent(trackingOrId)}`);
    },
    async list(phone = null) {
      const url = phone ? `/deliveries?phone=${encodeURIComponent(phone)}` : '/deliveries';
      return await request(url);
    },
    async confirmHandover(deliveryId) {
      return await request(`/deliveries/${deliveryId}/confirm-handover`, {
        method: 'POST'
      });
    },
    async disputeHandover(deliveryId, reason = '') {
      return await request(`/deliveries/${deliveryId}/dispute-handover`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    async getSuggestions(query) {
      return await request(`/deliveries/suggestions?q=${encodeURIComponent(query)}`);
    },
    async getHandover(deliveryId) {
      return await request(`/deliveries/${deliveryId}/handover`);
    }
  },

  // Payments (100% Cashless MTN/Airtel)
  payments: {
    async initiate(paymentData) {
      return await request('/payments/initiate', {
        method: 'POST',
        body: JSON.stringify(paymentData)
      });
    },
    async verify(referenceId, simulateFailure = false) {
      return await request('/payments/verify', {
        method: 'POST',
        body: JSON.stringify({ reference_id: referenceId, simulate_failure: simulateFailure })
      });
    }
  },

  // Courier Operations
  courier: {
    async getMyDeliveries() {
      return await request('/courier/my-deliveries');
    },
    async markArrived(deliveryId, note = '') {
      return await request(`/courier/deliveries/${deliveryId}/arrive`, {
        method: 'POST',
        body: JSON.stringify({ note })
      });
    },
    async updateStatus(deliveryId, status, note = '') {
      return await request(`/courier/deliveries/${deliveryId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note })
      });
    },
    async confirmReceipt(deliveryId) {
      return await request(`/courier/deliveries/${deliveryId}/confirm-receipt`, {
        method: 'POST'
      });
    },
    async reportNotReceived(deliveryId) {
      return await request(`/courier/deliveries/${deliveryId}/report-not-received`, {
        method: 'POST'
      });
    },
    async verifyPinAndDeliver(deliveryId, pin) {
      return await request(`/courier/deliveries/${deliveryId}/verify-pin-and-deliver`, {
        method: 'POST',
        body: JSON.stringify({ pin })
      });
    }
  },

  // Admin Portal
  admin: {
    async getStats() {
      return await request('/admin/stats');
    },
    async getDeliveries(status = 'all', search = '') {
      return await request(`/admin/deliveries?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`);
    },
    async getHandoverAudit(deliveryId) {
      return await request(`/admin/deliveries/${deliveryId}/handover-audit`);
    },
    async correctHandover(deliveryId, action, reason) {
      return await request(`/admin/deliveries/${deliveryId}/correct-handover`, {
        method: 'POST',
        body: JSON.stringify({ action, reason })
      });
    },
    async assignCourier(deliveryId, courierId) {
      return await request(`/admin/deliveries/${deliveryId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ courier_id: courierId })
      });
    },
    async updateStatus(deliveryId, status, note = '') {
      return await request(`/admin/deliveries/${deliveryId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, note })
      });
    },
    async getCouriers() {
      return await request('/admin/couriers');
    },
    async addCourier(courierData) {
      return await request('/admin/couriers', {
        method: 'POST',
        body: JSON.stringify(courierData)
      });
    },
    async toggleCourier(courierId) {
      return await request(`/admin/couriers/${courierId}/toggle`, {
        method: 'POST'
      });
    },
    async getPayments() {
      return await request('/admin/payments');
    },
    async getPricing() {
      return await request('/admin/pricing');
    },
    async updatePricing(pricingData) {
      return await request('/admin/pricing', {
        method: 'POST',
        body: JSON.stringify(pricingData)
      });
    },
    async getLogs() {
      return await request('/admin/logs');
    }
  }
};

window.kolaApi = api;
