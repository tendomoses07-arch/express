// Kola Express — Operations & Administration App Controller
// Manages application lifecycle, Role-Based Access Control (RBAC), and real DB syncing

(function () {
  'use strict';

  class AdminApp {
    constructor() {
      this.currentUser = null;
      this.currentRole = null;
      this.currentPermissions = null;
      this.activeTab = 'dashboard';
      this.refreshInterval = null;
      this.clockInterval = null;

      // Cache data
      this.deliveries = [];
      this.couriers = [];
      this.customers = [];

      this.init();
    }

    async init() {
      this.bindEvents();
      this.startClock();

      // Check current session
      if (adminApi.auth.isAuthenticated()) {
        try {
          const profile = await adminApi.auth.me();
          this.currentUser = profile.user;
          this.currentPermissions = profile.permissions;
          this.currentRole = profile.user.admin_role || 'super_admin';
          this.showAppLayout();
        } catch (e) {
          console.warn('Session verification failed:', e.message);
          this.showLoginPortal();
        }
      } else {
        this.showLoginPortal();
      }
    }

    // =================================================================
    // UI Switching & Auth Lifecycle
    // =================================================================
    showLoginPortal() {
      clearInterval(this.refreshInterval);
      document.getElementById('adminLoginPortal').style.display = 'flex';
      document.getElementById('adminAppLayout').style.display = 'none';
    }

    showAppLayout() {
      document.getElementById('adminLoginPortal').style.display = 'none';
      document.getElementById('adminAppLayout').style.display = 'flex';

      // Update role & username badges
      const roleLabels = {
        super_admin: 'Super Admin',
        operations_admin: 'Operations Admin',
        finance_admin: 'Finance Admin'
      };

      document.getElementById('userRoleBadge').textContent = roleLabels[this.currentRole] || this.currentRole;
      document.getElementById('userNameBadge').textContent = this.currentUser.name || this.currentUser.phone;

      // Apply RBAC tab gating
      this.applyRbacVisibility();

      // Set default tab based on role
      if (this.currentRole === 'finance_admin') {
        this.switchTab('payments');
      } else {
        this.switchTab('dashboard');
      }

      // Start periodic refresh (every 15 seconds)
      clearInterval(this.refreshInterval);
      this.refreshInterval = setInterval(() => {
        this.refreshActiveTabData(true);
      }, 15000);
    }

    applyRbacVisibility() {
      const isSuper = this.currentRole === 'super_admin';
      const isOps = this.currentRole === 'operations_admin' || isSuper;
      const isFinance = this.currentRole === 'finance_admin' || isSuper;

      // Operations navigation
      const navDeliveries = document.getElementById('navDeliveries');
      const navCouriers = document.getElementById('navCouriers');
      const navCustomers = document.getElementById('navCustomers');

      if (navDeliveries) navDeliveries.style.display = isOps ? 'flex' : 'none';
      if (navCouriers) navCouriers.style.display = isOps ? 'flex' : 'none';
      if (navCustomers) navCustomers.style.display = isOps ? 'flex' : 'none';

      // Finance navigation
      const secFinance = document.getElementById('sectionFinanceTitle');
      const navPayments = document.getElementById('navPayments');
      const navReports = document.getElementById('navReports');

      if (secFinance) secFinance.style.display = isFinance ? 'block' : 'none';
      if (navPayments) navPayments.style.display = isFinance ? 'flex' : 'none';
      if (navReports) navReports.style.display = isFinance ? 'flex' : 'none';

      // Super Admin governance navigation
      const secSuper = document.getElementById('sectionSuperTitle');
      const navPricing = document.getElementById('navPricing');
      const navAudit = document.getElementById('navAudit');
      const navStaff = document.getElementById('navStaff');

      if (secSuper) secSuper.style.display = isSuper ? 'block' : 'none';
      if (navPricing) navPricing.style.display = isSuper ? 'flex' : 'none';
      if (navAudit) navAudit.style.display = isSuper ? 'flex' : 'none';
      if (navStaff) navStaff.style.display = isSuper ? 'flex' : 'none';
    }

    handleSessionExpired() {
      this.showToast('Session expired. Please log in again.', 'error');
      this.showLoginPortal();
    }

    // =================================================================
    // Event Listeners
    // =================================================================
    bindEvents() {
      // Login Form
      const loginForm = document.getElementById('adminLoginForm');
      if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const errBox = document.getElementById('loginErrorBox');
          const submitBtn = document.getElementById('loginSubmitBtn');
          errBox.style.display = 'none';
          submitBtn.disabled = true;
          submitBtn.textContent = 'Verifying Credentials...';

          try {
            const identifier = document.getElementById('loginIdentifier').value.trim();
            const password = document.getElementById('loginPassword').value;

            const res = await adminApi.auth.login(identifier, password);
            this.currentUser = res.user;
            this.currentRole = res.user.admin_role || 'super_admin';

            const profile = await adminApi.auth.me();
            this.currentPermissions = profile.permissions;

            this.showToast(`Welcome back, ${res.user.name || 'Admin'}!`, 'success');
            this.showAppLayout();
          } catch (err) {
            errBox.textContent = err.message || 'Login failed. Please check credentials.';
            errBox.style.display = 'block';
          } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Secure Sign In</span> <span>→</span>';
          }
        });
      }

      // Quick Role Presets
      document.getElementById('fillSuperAdmin')?.addEventListener('click', () => {
        document.getElementById('loginIdentifier').value = 'admin@kolaexpress.ug';
        document.getElementById('loginPassword').value = 'admin123';
      });
      document.getElementById('fillOpsAdmin')?.addEventListener('click', () => {
        document.getElementById('loginIdentifier').value = 'ops@kolaexpress.ug';
        document.getElementById('loginPassword').value = 'ops123';
      });
      document.getElementById('fillFinanceAdmin')?.addEventListener('click', () => {
        document.getElementById('loginIdentifier').value = 'finance@kolaexpress.ug';
        document.getElementById('loginPassword').value = 'finance123';
      });

      // Navigation Links
      document.querySelectorAll('.sidebar-nav .nav-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          const tab = link.getAttribute('data-tab');
          if (tab) this.switchTab(tab);
        });
      });

      // Header actions
      document.getElementById('logoutBtn')?.addEventListener('click', () => {
        adminApi.auth.logout();
        this.showToast('Signed out successfully.', 'info');
        this.showLoginPortal();
      });

      document.getElementById('refreshDataBtn')?.addEventListener('click', () => {
        this.refreshActiveTabData(false);
        this.showToast('Data refreshed.', 'info');
      });

      document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('kola_admin_theme', nextTheme);
      });

      // Mobile drawer toggle
      document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
        document.getElementById('adminSidebar')?.classList.toggle('open');
      });

      // Tab Specific Filters
      document.getElementById('deliveriesSearchInput')?.addEventListener('input', () => this.filterDeliveries());
      document.getElementById('deliveriesStatusFilter')?.addEventListener('change', () => this.loadDeliveries());
      document.getElementById('paymentsStatusFilter')?.addEventListener('change', () => this.loadPayments());
      document.getElementById('customersSearchInput')?.addEventListener('input', (e) => this.loadCustomers(e.target.value));

      // Courier Modal Trigger & Submit
      document.getElementById('openAddCourierModalBtn')?.addEventListener('click', () => {
        this.openModal('modalAddCourier');
      });

      document.getElementById('addCourierForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const courierData = {
            full_name: document.getElementById('newCourierName').value.trim(),
            name: document.getElementById('newCourierName').value.trim(),
            phone: document.getElementById('newCourierPhone').value.trim(),
            vehicle_type: document.getElementById('newCourierVehicle').value,
            plate_number: document.getElementById('newCourierPlate').value.trim(),
            vehicle_plate: document.getElementById('newCourierPlate').value.trim()
          };
          await adminApi.couriers.create(courierData);
          this.closeModal('modalAddCourier');
          this.showToast('Courier registered successfully.', 'success');
          document.getElementById('addCourierForm').reset();
          this.loadCouriers();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });

      // Operations Fast Dispatch Form Submit
      document.getElementById('opsFastAssignForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const customId = document.getElementById('opsFastDeliveryCustomId')?.value.trim();
        const selectId = document.getElementById('opsFastDeliverySelect')?.value;
        const deliveryId = customId || selectId;
        const courierId = document.getElementById('opsFastCourierSelect')?.value;

        if (!deliveryId) {
          this.showToast('Please select a delivery order or enter a Delivery ID / Tracking #', 'error');
          return;
        }
        if (!courierId) {
          this.showToast('Please select an available courier to assign', 'error');
          return;
        }

        const btn = document.getElementById('opsFastAssignBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '⚡ Assigning...';
        }

        try {
          const res = await adminApi.operations.assignCourier(deliveryId, courierId);
          this.showToast(res.message || 'Delivery successfully assigned to courier!', 'success');
          if (document.getElementById('opsFastDeliveryCustomId')) {
            document.getElementById('opsFastDeliveryCustomId').value = '';
          }
          await this.loadDeliveries();
          await this.loadCouriers();
          await this.loadDashboard();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
          }
        }
      });

      // Courier Assignment Modal Submit
      document.getElementById('assignCourierForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const deliveryId = document.getElementById('assignDeliveryId').value.trim();
        const courierId = document.getElementById('assignCourierSelect').value;
        if (!deliveryId || !courierId) return;

        const btn = document.getElementById('confirmAssignBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '⚡ Dispatching...';
        }

        try {
          const res = await adminApi.operations.assignCourier(deliveryId, courierId);
          this.closeModal('modalAssignCourier');
          this.showToast(res.message || `Courier dispatched to delivery #${deliveryId}.`, 'success');
          await this.loadDeliveries();
          await this.loadCouriers();
          await this.loadDashboard();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
          }
        }
      });

      // Cancel Delivery Submit
      document.getElementById('cancelDeliveryForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const deliveryId = document.getElementById('cancelDeliveryId').value;
        const reason = document.getElementById('cancelDeliveryReason').value.trim();
        if (!deliveryId || !reason) return;

        try {
          await adminApi.deliveries.cancel(deliveryId, reason);
          this.closeModal('modalCancelDelivery');
          this.showToast(`Delivery #${deliveryId} cancelled.`, 'info');
          this.loadDeliveries();
          this.loadDashboard();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });

      // Super Admin Staff Provision
      document.getElementById('openAddStaffModalBtn')?.addEventListener('click', () => {
        this.openModal('modalAddStaff');
      });

      document.getElementById('addStaffForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const staffData = {
            name: document.getElementById('newStaffName').value.trim(),
            email: document.getElementById('newStaffEmail').value.trim(),
            phone: document.getElementById('newStaffPhone').value.trim(),
            admin_role: document.getElementById('newStaffRole').value,
            password: document.getElementById('newStaffPassword').value
          };
          await adminApi.staff.create(staffData);
          this.closeModal('modalAddStaff');
          this.showToast('Admin staff account created.', 'success');
          document.getElementById('addStaffForm').reset();
          this.loadStaff();
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });

      // Super Admin Pricing Engine Form
      document.getElementById('adminPricingForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const pricingData = {
            base_fee: Number(document.getElementById('pricingBaseFare').value),
            per_km_rate: Number(document.getElementById('pricingPerKm').value),
            min_fee: Number(document.getElementById('pricingMinFare').value),
            urgent_surcharge: Number(document.getElementById('pricingRushSurcharge').value),
            category_surcharges: {
              document: Number(document.getElementById('pricingCatDocument').value || 0),
              small_parcel: Number(document.getElementById('pricingCatSmallParcel').value || 0),
              medium_box: Number(document.getElementById('pricingCatMediumBox').value || 0),
              large_package: Number(document.getElementById('pricingCatLargePackage').value || 0),
              groceries: Number(document.getElementById('pricingCatGroceries').value || 0),
              fragile: Number(document.getElementById('pricingCatFragile').value || 0)
            }
          };
          await adminApi.pricing.update(pricingData);
          this.showToast('Pricing rules and category surcharges saved successfully.', 'success');
        } catch (err) {
          this.showToast(err.message, 'error');
        }
      });

      // Topbar Change My Password Button
      document.getElementById('changeMyPasswordBtn')?.addEventListener('click', () => {
        this.openMyPasswordModal();
      });

      // Submit Change Staff / Role Password Form (Super Admin)
      document.getElementById('changeStaffPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetType = document.getElementById('changeStaffPasswordTargetType').value;
        const staffId = document.getElementById('changeStaffPasswordStaffId').value;
        const role = document.getElementById('changeStaffPasswordRole').value;
        const newPassword = document.getElementById('changeStaffNewPassword').value;
        const confirmPassword = document.getElementById('changeStaffConfirmPassword').value;

        if (newPassword !== confirmPassword) {
          this.showToast('Passwords do not match. Please re-enter.', 'error');
          return;
        }

        if (newPassword.length < 4) {
          this.showToast('New password must be at least 4 characters.', 'error');
          return;
        }

        const btn = document.getElementById('submitChangeStaffPasswordBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = 'Updating...';
        }

        try {
          let res;
          if (targetType === 'role') {
            res = await adminApi.staff.changePasswordByRole(role, newPassword);
          } else {
            res = await adminApi.staff.changePassword(staffId, newPassword);
          }
          this.closeModal('modalChangeStaffPassword');
          this.showToast(res.message || 'Password updated successfully.', 'success');
          document.getElementById('changeStaffPasswordForm').reset();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
          }
        }
      });

      // Submit Change My Password Form (Self-Service)
      document.getElementById('changeMyPasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('myCurrentPassword').value;
        const newPassword = document.getElementById('myNewPassword').value;
        const confirmPassword = document.getElementById('myConfirmPassword').value;

        if (newPassword !== confirmPassword) {
          this.showToast('New passwords do not match. Please re-enter.', 'error');
          return;
        }

        if (newPassword.length < 4) {
          this.showToast('New password must be at least 4 characters.', 'error');
          return;
        }

        const btn = document.getElementById('submitChangeMyPasswordBtn');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = 'Updating...';
        }

        try {
          const res = await adminApi.auth.changeMyPassword(currentPassword, newPassword);
          this.closeModal('modalChangeMyPassword');
          this.showToast(res.message || 'Your password has been changed successfully.', 'success');
          document.getElementById('changeMyPasswordForm').reset();
        } catch (err) {
          this.showToast(err.message, 'error');
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
          }
        }
      });
    }

    // =================================================================
    // Tab Switching
    // =================================================================
    switchTab(tabName) {
      this.activeTab = tabName;

      // Update sidebar nav active state
      document.querySelectorAll('.sidebar-nav .nav-link').forEach((link) => {
        if (link.getAttribute('data-tab') === tabName) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      // Update pane visibility
      document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.style.display = 'none';
      });

      const targetPane = document.getElementById(`pane-${tabName}`);
      if (targetPane) {
        targetPane.style.display = 'block';
      }

      // Page Title
      const titles = {
        dashboard: 'Operational Overview & Live Metrics',
        deliveries: 'Deliveries, Tracking & Handover Trail',
        couriers: 'Courier Fleet Management',
        customers: 'Customer Accounts Directory',
        payments: 'Cashless MoMo Financial Ledger',
        reports: 'Operational & Financial Analytics',
        pricing: 'Pricing & Surcharge Engine',
        audit: 'System Security & Admin Audit Logs',
        staff: 'Internal Staff & RBAC Permissions'
      };
      document.getElementById('currentPageTitle').textContent = titles[tabName] || 'Operations Console';

      // Close mobile drawer if open
      document.getElementById('adminSidebar')?.classList.remove('open');

      // Load tab data
      this.refreshActiveTabData(false);
    }

    refreshActiveTabData(silent = false) {
      switch (this.activeTab) {
        case 'dashboard':
          this.loadDashboard(silent);
          break;
        case 'deliveries':
          this.loadDeliveries(silent);
          break;
        case 'couriers':
          this.loadCouriers(silent);
          break;
        case 'customers':
          const custSearch = document.getElementById('customersSearchInput')?.value || '';
          this.loadCustomers(custSearch, silent);
          break;
        case 'payments':
          this.loadPayments(silent);
          break;
        case 'reports':
          this.loadReports(silent);
          break;
        case 'pricing':
          this.loadPricing(silent);
          break;
        case 'audit':
          this.loadAuditLogs(silent);
          break;
        case 'staff':
          this.loadStaff(silent);
          break;
      }
    }

    // =================================================================
    // TAB LOADERS
    // =================================================================

    // 1. DASHBOARD
    async loadDashboard(silent = false) {
      try {
        const [stats, events, deliveries] = await Promise.all([
          adminApi.dashboard.getStats(),
          adminApi.dashboard.getEvents(),
          adminApi.deliveries.list('all', '')
        ]);

        // Update Stat Tiles with real DB numbers
        document.getElementById('statTotalDeliveries').textContent = stats.total_deliveries ?? 0;
        document.getElementById('statActiveDeliveries').textContent = stats.active_deliveries ?? 0;
        document.getElementById('statCompletedDeliveries').textContent = stats.completed_deliveries ?? 0;
        document.getElementById('statActiveCouriers').textContent = stats.active_couriers ?? 0;
        document.getElementById('statTotalRevenue').textContent = `UGX ${(stats.total_revenue || 0).toLocaleString()}`;
        document.getElementById('statPendingHandover').textContent = stats.awaiting_handover ?? 0;

        // Render Live Event Stream
        const eventList = document.getElementById('dashboardEventList');
        if (eventList) {
          if (events && events.length > 0) {
            eventList.innerHTML = events.slice(0, 15).map(ev => {
              const evType = ev.type || ev.status || ev.event_type || 'Update';
              const evMsg = ev.message || (ev.tracking_number ? `${ev.tracking_number}: ${ev.status || ''} ${ev.note ? '— ' + ev.note : ''}` : (ev.note || 'Delivery Event'));
              return `
                <div style="padding:0.65rem 0.85rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span class="admin-badge ${this.getBadgeClass(evType)}" style="font-size:0.675rem; margin-right:0.4rem;">${this.escapeHtml(String(evType).replace(/_/g, ' '))}</span>
                    <span style="color:var(--text-main); font-weight:600;">${this.escapeHtml(evMsg)}</span>
                  </div>
                  <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-dim);">${this.formatTime(ev.timestamp)}</span>
                </div>
              `;
            }).join('');
          } else {
            eventList.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:1.5rem 0;">No recent system events.</div>';
          }
        }

        // Render Priority Dispatch Queue (unassigned or awaiting handover)
        const recentTable = document.getElementById('dashboardRecentDeliveriesTable');
        const priorityList = (deliveries || []).filter(d => ['paid', 'courier_assigned', 'courier_arrived'].includes(d.delivery_status)).slice(0, 6);

        if (priorityList.length > 0) {
          recentTable.innerHTML = priorityList.map(d => `
            <tr>
              <td style="font-family:var(--font-mono); font-weight:700; color:#60a5fa;">#${d.id}</td>
              <td>${this.escapeHtml(d.customer_name || d.customer_phone || 'Customer')}</td>
              <td>
                <div style="font-weight:600;">${this.escapeHtml(d.pickup_location)}</div>
                <div style="font-size:0.75rem; color:var(--text-dim);">→ ${this.escapeHtml(d.dropoff_location)}</div>
              </td>
              <td>${this.renderStatusPill(d.delivery_status)}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="window.adminApp.inspectDelivery(${d.id})">Inspect</button>
              </td>
            </tr>
          `).join('');
        } else {
          recentTable.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1.5rem;">All priority dispatches are currently in motion.</td></tr>';
        }

      } catch (err) {
        if (!silent) this.showToast('Failed to load dashboard statistics: ' + err.message, 'error');
      }
    }

    // 2. DELIVERIES
    async loadDeliveries(silent = false) {
      const status = document.getElementById('deliveriesStatusFilter')?.value || 'all';
      const search = document.getElementById('deliveriesSearchInput')?.value.trim() || '';
      const tbody = document.getElementById('deliveriesTableBody');

      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">Fetching deliveries from database...</td></tr>';
        }
        const data = await adminApi.deliveries.list(status, search);
        this.deliveries = data || [];
        this.renderDeliveriesTable();
        this.updateOperationsDispatchControls(silent);
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:#f87171;">Error loading deliveries: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    filterDeliveries() {
      const q = document.getElementById('deliveriesSearchInput').value.toLowerCase().trim();
      const rows = document.querySelectorAll('#deliveriesTableBody tr');
      rows.forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
      });
    }

    renderDeliveriesTable() {
      const tbody = document.getElementById('deliveriesTableBody');
      if (!this.deliveries || this.deliveries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">No deliveries match the filter.</td></tr>';
        return;
      }

      const isOps = this.currentRole === 'operations_admin' || this.currentRole === 'super_admin';

      tbody.innerHTML = this.deliveries.map(d => {
        const statusKey = String(d.delivery_status || d.status || '').toLowerCase();
        const canAssign = isOps && !['delivered', 'cancelled'].includes(statusKey);
        const canCancel = isOps && !['delivered', 'cancelled'].includes(statusKey);

        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700; color:#60a5fa;">#${d.id}</td>
            <td style="font-size:0.775rem; color:var(--text-dim);">${this.formatDate(d.created_at)}</td>
            <td>
              <div style="font-weight:700;">${this.escapeHtml(d.customer_name || 'Guest Sender')}</div>
              <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${this.escapeHtml(d.customer_phone || '')}</div>
            </td>
            <td>
              <div style="font-size:0.8rem; font-weight:600;">Pickup: ${this.escapeHtml(d.pickup_location)}</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">Dropoff: ${this.escapeHtml(d.dropoff_location)}</div>
            </td>
            <td>
              <div style="font-weight:600;">${this.escapeHtml(d.package_description || 'Standard Parcel')}</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${d.package_weight || 1}kg • UGX ${(d.price || 0).toLocaleString()}</div>
            </td>
            <td>
              ${d.courier_name 
                ? `<div><strong>${this.escapeHtml(d.courier_name)}</strong></div><div style="font-size:0.75rem; color:var(--text-dim);">${this.escapeHtml(d.courier_phone || '')}</div>` 
                : `<span style="color:var(--text-dim); font-style:italic;">Unassigned</span>`}
            </td>
            <td>
              <span class="admin-badge ${d.payment_status === 'paid' ? 'success' : (d.payment_status === 'pending' ? 'warning' : 'danger')}">
                ${d.payment_status === 'paid' ? '✓ Paid' : (d.payment_status || 'Pending')}
              </span>
            </td>
            <td>
              <div>${this.renderStatusPill(d.delivery_status)}</div>
              ${d.sender_handover_confirmed ? '<div style="font-size:0.7rem; color:#34d399; margin-top:2px;">🤝 Handover Confirmed</div>' : ''}
              ${d.recipient_pin_verified ? '<div style="font-size:0.7rem; color:#34d399; margin-top:2px;">🔑 Recipient PIN Verified</div>' : ''}
            </td>
            <td>
              <div style="display:flex; gap:0.4rem; align-items:center;">
                <button class="btn btn-secondary btn-sm" onclick="window.adminApp.inspectDelivery(${d.id})">Audit</button>
                ${canAssign ? `<button class="btn btn-primary btn-sm" onclick="window.adminApp.openAssignModal(${d.id})">${d.courier_id ? 'Reassign' : 'Assign'}</button>` : ''}
                ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="window.adminApp.openCancelModal(${d.id})">Cancel</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 3. COURIERS
    async loadCouriers(silent = false) {
      const tbody = document.getElementById('couriersTableBody');
      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading couriers...</td></tr>';
        }
        const data = await adminApi.couriers.list();
        this.couriers = data || [];
        this.renderCouriersTable();
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#f87171;">Failed to load couriers: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    renderCouriersTable() {
      const tbody = document.getElementById('couriersTableBody');
      if (!this.couriers || this.couriers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No couriers registered yet.</td></tr>';
        return;
      }

      const isOps = this.currentRole === 'operations_admin' || this.currentRole === 'super_admin';

      tbody.innerHTML = this.couriers.map(c => {
        const name = c.full_name || c.name || 'Unnamed Courier';
        const plate = c.plate_number || c.vehicle_plate || '—';
        const isActive = c.status === 'active' || c.is_active === true || c.is_active === 1;
        const activeTasks = c.active_tasks ?? c.active_orders_count ?? 0;
        const completedDeliveries = c.completed_deliveries ?? c.completed_orders_count ?? c.total_trips ?? 0;

        return `
          <tr>
            <td style="font-family:var(--font-mono); font-weight:700;">#${c.id}</td>
            <td>
              <div style="font-weight:700; color:var(--text-main);">${this.escapeHtml(name)}</div>
            </td>
            <td style="font-family:var(--font-mono); font-size:0.8rem;">${this.escapeHtml(c.phone || '')}</td>
            <td>
              <div>${this.escapeHtml(c.vehicle_type || 'Motorcycle')}</div>
              <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${this.escapeHtml(plate)}</div>
            </td>
            <td>
              <span class="admin-badge ${isActive ? 'success' : 'danger'}">
                ${isActive ? '● Active' : '○ Offline / Inactive'}
              </span>
            </td>
            <td style="font-weight:700; text-align:center;">${activeTasks}</td>
            <td style="font-weight:700; text-align:center; color:#34d399;">${completedDeliveries}</td>
            <td>
              ${isOps ? `
                <div style="display:flex; gap:0.4rem; align-items:center;">
                  ${isActive ? `
                    <button class="btn btn-primary btn-sm" onclick="window.adminApp.openAssignForCourierModal(${c.id})">
                      ⚡ Dispatch
                    </button>
                  ` : ''}
                  <button class="btn ${isActive ? 'btn-secondary' : 'btn-outline'} btn-sm" onclick="window.adminApp.toggleCourierStatus(${c.id})">
                    ${isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              ` : '<span style="color:var(--text-dim);">Read-only</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }

    async toggleCourierStatus(courierId) {
      try {
        await adminApi.couriers.toggleStatus(courierId);
        this.showToast('Courier status updated.', 'success');
        this.loadCouriers();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }

    // 4. CUSTOMERS
    async loadCustomers(search = '', silent = false) {
      const tbody = document.getElementById('customersTableBody');
      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading customers...</td></tr>';
        }
        const data = await adminApi.customers.list(search);
        this.customers = data || [];
        this.renderCustomersTable();
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#f87171;">Failed to load customers: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    renderCustomersTable() {
      const tbody = document.getElementById('customersTableBody');
      if (!this.customers || this.customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No customer records found.</td></tr>';
        return;
      }

      tbody.innerHTML = this.customers.map(cust => `
        <tr>
          <td>
            <div style="font-weight:700;">${this.escapeHtml(cust.full_name || cust.name || 'Customer')}</div>
            <div style="font-size:0.75rem; color:var(--text-dim);">ID #${cust.id}</div>
          </td>
          <td>
            <div>${this.escapeHtml(cust.email || '—')}</div>
            <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${this.escapeHtml(cust.phone || '')}</div>
          </td>
          <td style="font-size:0.775rem; color:var(--text-dim);">${this.formatDate(cust.created_at)}</td>
          <td style="font-weight:700; text-align:center;">${cust.total_orders != null ? cust.total_orders : (cust.total_deliveries ?? 0)}</td>
          <td style="font-weight:700; text-align:center; color:#60a5fa;">${cust.active_orders != null ? cust.active_orders : (cust.active_deliveries ?? 0)}</td>
          <td style="font-weight:700; color:#34d399;">UGX ${(cust.total_spend || 0).toLocaleString()}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.adminApp.inspectCustomerOrders(${cust.id})">Order History</button>
          </td>
        </tr>
      `).join('');
    }

    async inspectCustomerOrders(customerId) {
      try {
        const res = await adminApi.customers.get(customerId);
        if (!res) return;
        const cust = res.customer || res;
        const deliveries = res.deliveries || [];

        this.openModal('modalInspectDelivery');
        document.getElementById('inspectTrackingId').textContent = `Customer #${cust.id}: ${cust.full_name || cust.name || cust.phone || 'Customer'}`;

        const content = document.getElementById('inspectDeliveryContent');
        content.innerHTML = `
          <div style="margin-bottom:1.5rem; padding:1rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-md);">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.85rem;">
              <div><strong>Name:</strong> ${this.escapeHtml(cust.full_name || cust.name || '—')}</div>
              <div><strong>Phone:</strong> ${this.escapeHtml(cust.phone || '—')}</div>
              <div><strong>Email:</strong> ${this.escapeHtml(cust.email || '—')}</div>
              <div><strong>Total Orders:</strong> ${deliveries.length}</div>
            </div>
          </div>

          <h4 style="font-size:0.95rem; font-weight:800; margin-bottom:0.75rem;">Past Deliveries &amp; Full Order History</h4>
          <div class="table-responsive">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Tracking ID</th>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${deliveries.length === 0 ? `
                  <tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No deliveries recorded for this customer.</td></tr>
                ` : deliveries.map(d => `
                  <tr>
                    <td style="font-family:var(--font-mono); color:#60a5fa; font-weight:700;">#${d.id} <span style="font-size:0.75rem; color:var(--text-dim);">(${this.escapeHtml(d.tracking_number || '')})</span></td>
                    <td style="font-size:0.75rem;">${this.formatDate(d.created_at)}</td>
                    <td style="font-size:0.775rem;">${this.escapeHtml(d.pickup_location)} → ${this.escapeHtml(d.dropoff_location || d.delivery_location)}</td>
                    <td style="font-weight:600; color:#34d399;">UGX ${(d.price != null ? d.price : (d.delivery_fee || 0)).toLocaleString()}</td>
                    <td>${this.renderStatusPill(d.delivery_status || d.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }

    // 5. PAYMENTS LEDGER
    async loadPayments(silent = false) {
      const status = document.getElementById('paymentsStatusFilter')?.value || 'all';
      const tbody = document.getElementById('paymentsTableBody');
      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading payment transactions...</td></tr>';
        }
        const data = await adminApi.finance.getPayments(status);
        if (!data || data.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No payment records in ledger.</td></tr>';
          return;
        }

        if (tbody) {
          tbody.innerHTML = data.map(p => `
            <tr>
              <td style="font-family:var(--font-mono); font-weight:700; color:#38bdf8;">${this.escapeHtml(p.transaction_ref || 'TRX-' + p.id)}</td>
              <td style="font-family:var(--font-mono); font-weight:700; color:#60a5fa;">#${p.delivery_id}</td>
              <td>
                <div style="font-weight:600;">${this.escapeHtml(p.customer_name || 'Customer')}</div>
                <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${this.escapeHtml(p.customer_phone || '')}</div>
              </td>
              <td style="font-weight:800; font-size:0.95rem; color:#34d399;">UGX ${(p.amount || 0).toLocaleString()}</td>
              <td>
                <span class="admin-badge secondary">${this.escapeHtml(p.payment_method || 'MTN / Airtel MoMo')}</span>
              </td>
              <td style="font-size:0.775rem; color:var(--text-dim);">${this.formatDate(p.created_at)}</td>
              <td>
                <span class="admin-badge ${p.payment_status === 'paid' ? 'success' : (p.payment_status === 'pending' ? 'warning' : 'danger')}">
                  ${p.payment_status === 'paid' ? '✓ Successful' : (p.payment_status || 'Pending')}
                </span>
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#f87171;">Failed to load payments: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    // 6. REPORTS & ANALYTICS
    async loadReports() {
      try {
        const reports = await adminApi.finance.getReports();
        if (!reports) return;

        document.getElementById('reportTotalRevenue').textContent = `UGX ${(reports.total_revenue || 0).toLocaleString()}`;
        document.getElementById('reportFulfilledOrders').textContent = reports.completed_count || 0;
        document.getElementById('reportCancelledOrders').textContent = reports.cancelled_count || 0;
        document.getElementById('reportFleetSize').textContent = reports.fleet_size || 0;

        // Top Couriers Table
        const courierTbody = document.getElementById('reportCouriersTable');
        if (reports.top_couriers && reports.top_couriers.length > 0) {
          courierTbody.innerHTML = reports.top_couriers.map(c => `
            <tr>
              <td style="font-weight:700;">${this.escapeHtml(c.name)}</td>
              <td style="font-family:var(--font-mono); font-size:0.8rem;">${this.escapeHtml(c.phone)}</td>
              <td>${this.escapeHtml(c.vehicle_type || 'Motorcycle')}</td>
              <td style="font-weight:800; color:#34d399; text-align:center;">${c.completed_count} trips</td>
            </tr>
          `).join('');
        } else {
          courierTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">No courier trip metrics recorded yet.</td></tr>';
        }

        // Status Distribution
        const distContainer = document.getElementById('reportStatusDistribution');
        if (reports.status_breakdown) {
          distContainer.innerHTML = Object.entries(reports.status_breakdown).map(([st, cnt]) => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0.75rem; background:rgba(255,255,255,0.02); border-radius:var(--radius-sm); border:1px solid var(--border-color);">
              <div>${this.renderStatusPill(st)}</div>
              <span style="font-weight:800; font-size:0.95rem;">${cnt}</span>
            </div>
          `).join('');
        }
      } catch (err) {
        this.showToast('Failed to load reports: ' + err.message, 'error');
      }
    }

    // 7. PRICING ENGINE
    async loadPricing() {
      try {
        const pricing = await adminApi.pricing.get();
        if (pricing) {
          const rules = pricing.rules || pricing;
          document.getElementById('pricingBaseFare').value = rules.base_fee ?? rules.base_fare ?? 4000;
          document.getElementById('pricingPerKm').value = rules.per_km_rate ?? rules.per_km ?? 800;
          document.getElementById('pricingMinFare').value = rules.min_fee ?? rules.minimum_fare ?? 3500;
          document.getElementById('pricingRushSurcharge').value = rules.urgent_surcharge ?? rules.rush_hour_surcharge_percent ?? 3000;

          const cat = typeof rules.category_surcharges === 'string'
            ? JSON.parse(rules.category_surcharges)
            : (rules.category_surcharges || {});

          document.getElementById('pricingCatDocument').value = cat.document ?? 0;
          document.getElementById('pricingCatSmallParcel').value = cat.small_parcel ?? 500;
          document.getElementById('pricingCatMediumBox').value = cat.medium_box ?? 1500;
          document.getElementById('pricingCatLargePackage').value = cat.large_package ?? 3000;
          document.getElementById('pricingCatGroceries').value = cat.groceries ?? 1000;
          document.getElementById('pricingCatFragile').value = cat.fragile ?? 2000;
        }
      } catch (err) {
        this.showToast('Failed to load pricing engine parameters: ' + err.message, 'error');
      }
    }

    // 8. AUDIT LOGS
    async loadAuditLogs(silent = false) {
      const tbody = document.getElementById('auditLogsTableBody');
      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading immutable audit log trail...</td></tr>';
        }
        const logs = await adminApi.audit.getLogs();
        if (!logs || logs.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No audit events recorded yet.</td></tr>';
          return;
        }

        if (tbody) {
          tbody.innerHTML = logs.map(l => `
            <tr>
              <td style="font-family:var(--font-mono); font-size:0.775rem; color:var(--text-dim);">${this.formatDate(l.created_at)}</td>
              <td style="font-weight:700;">${this.escapeHtml(l.admin_name || 'Admin #' + l.admin_id)}</td>
              <td><span class="admin-badge info">${this.escapeHtml(l.admin_role || 'admin')}</span></td>
              <td style="font-weight:600; color:#f8fafc;">${this.escapeHtml(l.action)}</td>
              <td style="font-family:var(--font-mono); font-size:0.8rem; color:#93c5fd;">${this.escapeHtml(l.resource || '—')}</td>
              <td style="font-family:var(--font-mono); font-size:0.8rem;">#${this.escapeHtml(l.resource_id || '—')}</td>
              <td style="font-size:0.8rem; color:var(--text-muted); max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escapeHtml(l.details || '')}">
                ${this.escapeHtml(l.details || '—')}
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:#f87171;">Failed to load audit logs: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    // 9. ADMIN STAFF
    async loadStaff(silent = false) {
      const tbody = document.getElementById('staffTableBody');
      try {
        if (!silent && tbody) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">Loading staff directory...</td></tr>';
        }
        const staff = await adminApi.staff.list();
        if (!staff || staff.length === 0) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No administrative staff records found.</td></tr>';
          return;
        }

        if (tbody) {
          tbody.innerHTML = staff.map(s => `
            <tr>
              <td style="font-family:var(--font-mono); font-weight:700;">#${s.id}</td>
              <td style="font-weight:700;">${this.escapeHtml(s.name)}</td>
              <td>${this.escapeHtml(s.email || '—')}</td>
              <td style="font-family:var(--font-mono); font-size:0.8rem;">${this.escapeHtml(s.phone || '—')}</td>
              <td>
                <span class="admin-badge ${s.admin_role === 'super_admin' ? 'danger' : (s.admin_role === 'operations_admin' ? 'info' : 'warning')}">
                  ${s.admin_role.replace('_', ' ').toUpperCase()}
                </span>
              </td>
              <td>
                <span class="admin-badge ${s.is_active ? 'success' : 'danger'}">
                  ${s.is_active ? 'Active' : 'Suspended'}
                </span>
              </td>
              <td style="font-size:0.75rem; color:var(--text-dim);">${this.formatDate(s.created_at)}</td>
              <td>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                  <button class="btn btn-secondary btn-sm" onclick="window.adminApp.openStaffPasswordModal(${s.id}, '${this.escapeHtml(s.name)}', '${this.escapeHtml(s.email || '')}', '${s.admin_role}')" title="Change Password">
                    🔑 Password
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="window.adminApp.toggleStaffStatus(${s.id})">
                    ${s.is_active ? 'Suspend' : 'Activate'}
                  </button>
                </div>
              </td>
            </tr>
          `).join('');
        }
      } catch (err) {
        if (!silent && tbody) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#f87171;">Failed to load staff: ${this.escapeHtml(err.message)}</td></tr>`;
        }
      }
    }

    async toggleStaffStatus(staffId) {
      try {
        await adminApi.staff.toggleStatus(staffId);
        this.showToast('Staff status updated.', 'success');
        this.loadStaff();
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }

    // =================================================================
    // MODAL HANDLERS
    // =================================================================
    openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('active');
    }

    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    }

    openStaffPasswordModal(staffId, name, email, role) {
      const targetTypeEl = document.getElementById('changeStaffPasswordTargetType');
      const staffIdEl = document.getElementById('changeStaffPasswordStaffId');
      const roleEl = document.getElementById('changeStaffPasswordRole');
      const targetDisplayEl = document.getElementById('changeStaffPasswordTargetDisplay');
      const subtitleEl = document.getElementById('changeStaffPasswordSubtitle');
      const newPassEl = document.getElementById('changeStaffNewPassword');
      const confPassEl = document.getElementById('changeStaffConfirmPassword');

      if (targetTypeEl) targetTypeEl.value = 'staff_id';
      if (staffIdEl) staffIdEl.value = staffId;
      if (roleEl) roleEl.value = '';
      if (targetDisplayEl) targetDisplayEl.value = `${name} (${email || role})`;
      if (subtitleEl) subtitleEl.textContent = `Reset password for staff member #${staffId} (${role ? role.replace('_', ' ').toUpperCase() : 'ADMIN'})`;
      if (newPassEl) newPassEl.value = '';
      if (confPassEl) confPassEl.value = '';

      this.openModal('modalChangeStaffPassword');
    }

    openRolePasswordModal(role, label) {
      const targetTypeEl = document.getElementById('changeStaffPasswordTargetType');
      const staffIdEl = document.getElementById('changeStaffPasswordStaffId');
      const roleEl = document.getElementById('changeStaffPasswordRole');
      const targetDisplayEl = document.getElementById('changeStaffPasswordTargetDisplay');
      const subtitleEl = document.getElementById('changeStaffPasswordSubtitle');
      const newPassEl = document.getElementById('changeStaffNewPassword');
      const confPassEl = document.getElementById('changeStaffConfirmPassword');

      if (targetTypeEl) targetTypeEl.value = 'role';
      if (staffIdEl) staffIdEl.value = '';
      if (roleEl) roleEl.value = role;
      if (targetDisplayEl) targetDisplayEl.value = label;
      if (subtitleEl) subtitleEl.textContent = `Set direct new password for all active accounts with role "${role.replace('_', ' ').toUpperCase()}"`;
      if (newPassEl) newPassEl.value = '';
      if (confPassEl) confPassEl.value = '';

      this.openModal('modalChangeStaffPassword');
    }

    openMyPasswordModal() {
      const currPassEl = document.getElementById('myCurrentPassword');
      const newPassEl = document.getElementById('myNewPassword');
      const confPassEl = document.getElementById('myConfirmPassword');

      if (currPassEl) currPassEl.value = '';
      if (newPassEl) newPassEl.value = '';
      if (confPassEl) confPassEl.value = '';

      this.openModal('modalChangeMyPassword');
    }

    async inspectDelivery(deliveryId) {
      try {
        const d = await adminApi.deliveries.get(deliveryId);
        if (!d) return;

        this.openModal('modalInspectDelivery');
        document.getElementById('inspectTrackingId').textContent = `#${d.id} (${d.delivery_status})`;

        // Build 7-step Timeline checking real DB timestamps & flags
        const isCreated = !!d.created_at;
        const isPaid = d.payment_status === 'paid';
        const isAssigned = !!d.courier_id;
        const isEnRoute = ['courier_en_route', 'courier_arrived', 'picked_up', 'in_transit', 'delivered'].includes(d.delivery_status);
        const isArrived = ['courier_arrived', 'picked_up', 'in_transit', 'delivered'].includes(d.delivery_status);
        const isHandoverConfirmed = !!d.sender_handover_confirmed;
        const isPickedUp = ['picked_up', 'in_transit', 'delivered'].includes(d.delivery_status);
        const isInTransit = ['in_transit', 'delivered'].includes(d.delivery_status);
        const isDelivered = d.delivery_status === 'delivered';
        const isRecipientPinVerified = !!d.recipient_pin_verified;

        const content = document.getElementById('inspectDeliveryContent');
        content.innerHTML = `
          <!-- Meta Grid -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:1rem; border-radius:var(--radius-md);">
            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Customer / Sender</div>
              <div style="font-weight:700; font-size:0.95rem; margin-top:2px;">${this.escapeHtml(d.customer_name || 'Sender')}</div>
              <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${this.escapeHtml(d.customer_phone || '')}</div>
            </div>

            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Assigned Courier</div>
              <div style="font-weight:700; font-size:0.95rem; margin-top:2px;">${d.courier_name ? this.escapeHtml(d.courier_name) : '<span style="color:var(--text-dim); font-style:italic;">No Courier Assigned</span>'}</div>
              <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted);">${d.courier_phone ? this.escapeHtml(d.courier_phone) : ''}</div>
            </div>

            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Pickup Location</div>
              <div style="font-size:0.85rem; font-weight:600; margin-top:2px;">${this.escapeHtml(d.pickup_location)}</div>
            </div>

            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Destination Dropoff</div>
              <div style="font-size:0.85rem; font-weight:600; margin-top:2px;">${this.escapeHtml(d.dropoff_location)}</div>
            </div>

            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Package Details</div>
              <div style="font-size:0.85rem; font-weight:600; margin-top:2px;">${this.escapeHtml(d.package_description || 'Standard Parcel')} (${d.package_weight || 1}kg)</div>
            </div>

            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700;">Payment & Fare</div>
              <div style="font-size:0.85rem; font-weight:700; color:#34d399; margin-top:2px;">UGX ${(d.price || 0).toLocaleString()} • ${d.payment_status === 'paid' ? '✓ Paid' : (d.payment_status || 'Pending')}</div>
            </div>
          </div>

          <!-- Mandatory Sender Handover & Recipient PIN Verification Highlight -->
          <div style="background:rgba(37,99,235,0.08); border:1px solid rgba(59,130,246,0.3); border-radius:var(--radius-md); padding:1rem; margin-bottom:1.5rem;">
            <h4 style="font-size:0.875rem; font-weight:800; color:#93c5fd; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.65rem;">
              Digital Handover &amp; Verification Trail
            </h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; font-size:0.85rem;">
              <div>
                <strong>Sender Handover:</strong> 
                ${isHandoverConfirmed 
                  ? `<span style="color:#34d399; font-weight:700;">✓ Confirmed by Sender</span><br><span style="font-size:0.75rem; color:var(--text-dim);">Time: ${this.formatDate(d.sender_handover_confirmed_at)}</span>`
                  : `<span style="color:#fbbf24; font-weight:700;">⏳ Awaiting Sender Physical Confirmation</span>`}
              </div>

              <div>
                <strong>Recipient Delivery PIN:</strong>
                ${isRecipientPinVerified 
                  ? `<span style="color:#34d399; font-weight:700;">✓ Verified by Courier</span><br><span style="font-size:0.75rem; color:var(--text-dim);">Time: ${this.formatDate(d.recipient_pin_verified_at || d.delivered_at)}</span>`
                  : `<span style="color:#fbbf24; font-weight:700;">🔒 Required to finalize delivery</span>`}
              </div>
            </div>
          </div>

          <!-- 7-Milestone Timeline -->
          <h4 style="font-size:0.9rem; font-weight:800; margin-bottom:0.75rem; color:var(--text-main);">Dispatch Milestones &amp; Audit Trail</h4>
          <div style="display:flex; flex-direction:column; gap:0.65rem; border-left:2px solid var(--border-color); margin-left:0.5rem; padding-left:1.25rem;">
            
            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isCreated ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isCreated ? '#f8fafc' : 'var(--text-dim)'};">1. Delivery Created</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${this.formatDate(d.created_at)}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isPaid ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isPaid ? '#f8fafc' : 'var(--text-dim)'};">2. Cashless MoMo Payment Confirmed</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isPaid ? 'Payment verified in backend ledger' : 'Awaiting customer payment'}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isAssigned ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isAssigned ? '#f8fafc' : 'var(--text-dim)'};">3. Courier Dispatched / Assigned</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isAssigned ? (d.courier_name || 'Courier Assigned') : 'Pending dispatch assignment'}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isArrived ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isArrived ? '#f8fafc' : 'var(--text-dim)'};">4. Courier Arrived at Pickup</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isArrived ? 'Courier reported on-site at pickup location' : 'En route or not yet arrived'}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isHandoverConfirmed ? '#34d399' : '#fbbf24'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isHandoverConfirmed ? '#f8fafc' : '#fbbf24'};">5. Sender Confirmed Physical Handover</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isHandoverConfirmed ? 'Digital confirmation signed by sender' : 'Awaiting physical package handover by sender'}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isPickedUp ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isPickedUp ? '#f8fafc' : 'var(--text-dim)'};">6. Package Picked Up &amp; In Transit</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isPickedUp ? 'Courier moving towards dropoff destination' : 'Pending handover completion'}</div>
            </div>

            <div style="position:relative;">
              <div style="position:absolute; left:-1.65rem; top:0.2rem; width:12px; height:12px; border-radius:50%; background:${isDelivered ? '#34d399' : '#64748b'};"></div>
              <div style="font-weight:700; font-size:0.85rem; color:${isDelivered ? '#34d399' : 'var(--text-dim)'};">7. Delivered &amp; Recipient PIN Verified</div>
              <div style="font-size:0.75rem; color:var(--text-dim);">${isDelivered ? 'Trip closed successfully' : 'Final delivery pending'}</div>
            </div>

          </div>
        `;
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    }

    async openAssignModal(deliveryId, preselectedCourierId = null) {
      const idInput = document.getElementById('assignDeliveryId');
      if (idInput) idInput.value = deliveryId || '';

      const card = document.getElementById('assignDeliveryCard');
      if (card) {
        const d = (this.deliveries || []).find(item => String(item.id) === String(deliveryId) || item.tracking_number === deliveryId);
        if (d) {
          card.style.display = 'block';
          card.innerHTML = `
            <div style="font-weight:700; color:#60a5fa;">#${d.id} • ${this.escapeHtml(d.tracking_number)}</div>
            <div style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
              <strong>${this.escapeHtml(d.customer_name || 'Sender')}</strong> ➔ 
              <span>${this.escapeHtml(d.dropoff_location || d.delivery_location || 'Dropoff')}</span>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
              ${this.escapeHtml(d.package_description || 'Parcel')} • Status: ${this.renderStatusPill(d.delivery_status || d.status)}
            </div>
          `;
        } else {
          card.style.display = 'none';
        }
      }

      const select = document.getElementById('assignCourierSelect');
      select.innerHTML = '<option value="">Loading active couriers...</option>';

      try {
        const couriers = await adminApi.couriers.listAvailable();
        if (!couriers || couriers.length === 0) {
          select.innerHTML = '<option value="">No active couriers found. Please register or activate one.</option>';
        } else {
          select.innerHTML = '<option value="">-- Choose Active Courier --</option>' + couriers.map(c => `
            <option value="${c.id}" ${preselectedCourierId && String(preselectedCourierId) === String(c.id) ? 'selected' : ''}>
              ${this.escapeHtml(c.full_name || c.name)} (${this.escapeHtml(c.vehicle_plate || c.plate_number || 'Boda')}) — ${c.active_tasks || 0} active orders
            </option>
          `).join('');
          if (preselectedCourierId) {
            select.value = String(preselectedCourierId);
          }
        }
        this.openModal('modalAssignCourier');
      } catch (err) {
        this.showToast('Failed to load couriers: ' + err.message, 'error');
      }
    }

    async openAssignForCourierModal(courierId) {
      await this.openAssignModal('', courierId);
      const idInput = document.getElementById('assignDeliveryId');
      if (idInput) {
        idInput.focus();
      }
    }

    async updateOperationsDispatchControls(silent = false) {
      const fastDeliverySelect = document.getElementById('opsFastDeliverySelect');
      const fastCourierSelect = document.getElementById('opsFastCourierSelect');
      const badge = document.getElementById('opsAvailableBadge');

      if (!fastDeliverySelect || !fastCourierSelect) return;

      const savedDeliveryVal = fastDeliverySelect.value;
      const savedCourierVal = fastCourierSelect.value;

      try {
        const availableCouriers = await adminApi.couriers.listAvailable();
        if (badge) {
          badge.textContent = `${(availableCouriers || []).length} Active Couriers Ready`;
        }

        if (availableCouriers && availableCouriers.length > 0) {
          fastCourierSelect.innerHTML = '<option value="">-- Select Available Courier --</option>' +
            availableCouriers.map(c => `
              <option value="${c.id}">
                ${this.escapeHtml(c.full_name || c.name)} (${this.escapeHtml(c.vehicle_plate || c.plate_number)}) — ${c.active_tasks || 0} active tasks
              </option>
            `).join('');
          if (savedCourierVal) {
            fastCourierSelect.value = savedCourierVal;
          }
        } else {
          fastCourierSelect.innerHTML = '<option value="">No active couriers available</option>';
        }

        const assignable = (this.deliveries || []).filter(d => 
          !['delivered', 'cancelled'].includes(String(d.delivery_status || d.status).toLowerCase())
        );

        fastDeliverySelect.innerHTML = '<option value="">-- Choose Unassigned / Active Delivery --</option>' +
          assignable.map(d => `
            <option value="${d.id}">
              #${d.id} • ${d.tracking_number} [${d.courier_name ? 'Assigned: ' + this.escapeHtml(d.courier_name) : '⚡ Unassigned'}] ➔ ${this.escapeHtml(d.dropoff_location || d.delivery_location || '')}
            </option>
          `).join('');
        if (savedDeliveryVal) {
          fastDeliverySelect.value = savedDeliveryVal;
        }
      } catch (err) {
        console.warn('Could not update operations dispatch controls:', err.message);
      }
    }

    openCancelModal(deliveryId) {
      document.getElementById('cancelDeliveryId').value = deliveryId;
      document.getElementById('cancelDeliveryReason').value = '';
      this.openModal('modalCancelDelivery');
    }

    // =================================================================
    // UTILITIES
    // =================================================================
    startClock() {
      const clockEl = document.getElementById('adminClock');
      const update = () => {
        // Show Kampala time (UTC+3)
        const now = new Date();
        const eatTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).format(now);
        if (clockEl) clockEl.textContent = `EAT: ${eatTime}`;
      };
      update();
      this.clockInterval = setInterval(update, 1000);
    }

    renderStatusPill(status) {
      const map = {
        pending: { label: 'Pending Payment', class: 'warning' },
        paid: { label: 'Paid (Unassigned)', class: 'info' },
        courier_assigned: { label: 'Courier Assigned', class: 'info' },
        courier_en_route: { label: 'En Route to Pickup', class: 'info' },
        courier_arrived: { label: 'Awaiting Handover', class: 'warning' },
        picked_up: { label: 'Picked Up', class: 'info' },
        in_transit: { label: 'In Transit', class: 'info' },
        delivered: { label: '✓ Delivered', class: 'success' },
        cancelled: { label: 'Cancelled', class: 'danger' }
      };

      const info = map[status] || { label: status, class: 'secondary' };
      return `<span class="admin-badge ${info.class}">${info.label}</span>`;
    }

    getBadgeClass(type) {
      if (!type) return 'info';
      const t = String(type).toLowerCase();
      if (t.includes('created') || t.includes('login') || t.includes('delivery')) return 'info';
      if (t.includes('payment') || t.includes('delivered') || t.includes('confirmed') || t.includes('picked') || t.includes('paid')) return 'success';
      if (t.includes('cancel') || t.includes('failed') || t.includes('error')) return 'danger';
      return 'warning';
    }

    formatDate(dateStr) {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        }).format(d);
      } catch (e) {
        return dateStr;
      }
    }

    formatTime(dateStr) {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Kampala',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }).format(d);
      } catch (e) {
        return dateStr;
      }
    }

    showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;

      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  }

  // Instantiate globally
  window.addEventListener('DOMContentLoaded', () => {
    window.adminApp = new AdminApp();
  });
})();
