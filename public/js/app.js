// ===================================================================
// KOLA EXPRESS - CLIENT APPLICATION LOGIC
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentQuote = null;
  let activePaymentDelivery = null;
  let activePaymentRef = null;
  let quoteDebounceTimer = null;
  let stkPollingInterval = null;
  let selectedPickupCoords = null;
  let selectedDeliveryCoords = null;
  let currentAmbiguityData = null;

  // Cache DOM Elements
  const views = {
    home: document.getElementById('view-home'),
    track: document.getElementById('view-track'),
    account: document.getElementById('view-account'),
    courier: document.getElementById('view-courier')
  };

  const navLinks = document.querySelectorAll('.nav-link');
  const roleChips = document.querySelectorAll('.role-chip');
  const mobileNavToggle = document.getElementById('mobileNavToggle');
  const navMenu = document.getElementById('navMenu');

  // ===================================================================
  // 1. MANDATORY ACCESS GATE & ROUTING
  // ===================================================================
  function checkAuthAndEnforceGate() {
    const user = window.kolaApi.auth.getUser();
    const token = window.kolaApi.auth.getToken();
    const gate = document.getElementById('siteAuthGate');
    const content = document.getElementById('siteContentWrap');
    const headerUserBadge = document.getElementById('headerUserBadge');
    const headerUserName = document.getElementById('headerUserName');
    const headerUserRole = document.getElementById('headerUserRole');
    const customerNavItems = document.getElementById('customerNavItems');
    const courierNavItems = document.getElementById('courierNavItems');
    const chipCustomerApp = document.getElementById('chipCustomerApp');
    const chipCourierTasks = document.getElementById('chipCourierTasks');
    const brandTagline = document.getElementById('brandTagline');
    const roleBarTitle = document.getElementById('roleBarTitle');

    if (!user || !token) {
      if (gate) gate.style.display = 'flex';
      if (content) content.style.display = 'none';
      if (headerUserBadge) headerUserBadge.style.display = 'none';
      return false;
    }

    if (gate) gate.style.display = 'none';
    if (content) content.style.display = 'block';

    if (headerUserBadge) {
      headerUserBadge.style.display = 'inline-flex';
      if (headerUserName) {
        const firstName = (user.full_name || 'User').split(' ')[0];
        headerUserName.textContent = firstName;
      }
    }

    // Role-based UI Customization
    const chipAdminPortal = document.getElementById('chipAdminPortal');
    if (user.role === 'admin') {
      if (chipAdminPortal) chipAdminPortal.style.display = 'inline-flex';
      if (headerUserRole) {
        headerUserRole.textContent = 'Admin';
        headerUserRole.className = 'user-role-badge admin-role';
      }
    } else {
      if (chipAdminPortal) chipAdminPortal.style.display = 'none';
    }

    const mobileCustomerTabs = document.getElementById('mobileCustomerTabs');
    const mobileCourierTabs = document.getElementById('mobileCourierTabs');

    // Top portal role chips: Strictly enforce role isolation
    if (user.role === 'courier') {
      // COURIER ONLY INTERFACE - Strictly isolated from Customer App
      if (chipCustomerApp) chipCustomerApp.style.display = 'none';
      if (chipCourierTasks) chipCourierTasks.style.display = 'inline-flex';
      if (customerNavItems) customerNavItems.style.display = 'none';
      if (courierNavItems) courierNavItems.style.display = 'inline-flex';
      if (mobileCustomerTabs) mobileCustomerTabs.style.display = 'none';
      if (mobileCourierTabs) mobileCourierTabs.style.display = 'flex';
      if (headerUserRole) {
        headerUserRole.textContent = 'Courier Rider';
        headerUserRole.className = 'user-role-badge courier-role';
      }
      if (brandTagline) brandTagline.textContent = 'Courier Partner Portal';
      if (roleBarTitle) roleBarTitle.innerHTML = '<span>Rider Portal:</span>';
    } else if (user.role === 'admin') {
      // ADMIN INTERFACE
      if (chipCustomerApp) chipCustomerApp.style.display = 'inline-flex';
      if (chipCourierTasks) chipCourierTasks.style.display = 'inline-flex';
      if (customerNavItems) customerNavItems.style.display = 'inline-flex';
      if (courierNavItems) courierNavItems.style.display = 'none';
      if (mobileCustomerTabs) mobileCustomerTabs.style.display = 'flex';
      if (mobileCourierTabs) mobileCourierTabs.style.display = 'none';
      if (headerUserRole) {
        headerUserRole.textContent = 'Admin';
        headerUserRole.className = 'user-role-badge admin-role';
      }
      if (brandTagline) brandTagline.textContent = 'Admin Operations';
      if (roleBarTitle) roleBarTitle.innerHTML = '<span>Admin Portal:</span>';
    } else {
      // CUSTOMER ONLY INTERFACE (Default) - Strictly isolated from Courier Tasks
      if (chipCustomerApp) chipCustomerApp.style.display = 'inline-flex';
      if (chipCourierTasks) chipCourierTasks.style.display = 'none';
      if (customerNavItems) customerNavItems.style.display = 'inline-flex';
      if (courierNavItems) courierNavItems.style.display = 'none';
      if (mobileCustomerTabs) mobileCustomerTabs.style.display = 'flex';
      if (mobileCourierTabs) mobileCourierTabs.style.display = 'none';
      if (headerUserRole) {
        headerUserRole.textContent = 'Customer';
        headerUserRole.className = 'user-role-badge';
      }
      if (brandTagline) brandTagline.textContent = 'Send it. We deliver it.';
      if (roleBarTitle) roleBarTitle.innerHTML = '<span>Customer Portal:</span>';

      // Pre-fill sender details in delivery request form if customer is logged in and fields are empty
      const senderNameInput = document.getElementById('senderNameInput');
      const senderPhoneInput = document.getElementById('senderPhoneInput');
      if (senderNameInput && !senderNameInput.value && user?.full_name) {
        senderNameInput.value = user.full_name;
      }
      if (senderPhoneInput && !senderPhoneInput.value && user?.phone) {
        senderPhoneInput.value = user.phone;
      }
    }

    return true;
  }

  function handleBrandClick() {
    const user = window.kolaApi.auth.getUser();
    if (user?.role === 'courier') {
      switchView('courier');
    } else {
      switchView('home');
    }
  }

  function switchView(viewName, param = null) {
    if (!checkAuthAndEnforceGate()) {
      return;
    }

    const user = window.kolaApi.auth.getUser();

    // STRICT ROLE ACCESS CONTROL:
    // Couriers are strictly prohibited from viewing or accessing customer app pages
    if (user?.role === 'courier') {
      if (['home', 'request', 'account'].includes(viewName)) {
        console.warn(`[Access Restricted] Courier cannot access customer view "${viewName}". Enforcing courier dashboard.`);
        showToast('Courier accounts cannot access the Customer App. Showing your Assigned Tasks.', 'warning');
        viewName = 'courier';
      }
    } else if (user?.role === 'customer') {
      // Customers are prohibited from accessing courier tasks
      if (viewName === 'courier') {
        console.warn(`[Access Restricted] Customer cannot access courier dashboard.`);
        showToast('Assigned Tasks portal is restricted to registered couriers.', 'warning');
        viewName = 'home';
      }
    }

    if (viewName === 'request') {
      Object.keys(views).forEach(v => {
        if (views[v]) views[v].style.display = 'none';
      });
      if (views.home) views.home.style.display = 'block';

      // Update nav link active states: only request is active
      document.querySelectorAll('.nav-link').forEach(link => {
        if (link.dataset.view === 'request') {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });

      // Update role chip active states: Customer App
      document.querySelectorAll('.role-chip').forEach(chip => {
        if (chip.dataset.view === 'home') {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });

      // Update mobile bottom tab active states
      document.querySelectorAll('.mobile-tab-btn').forEach(tab => {
        if (tab.dataset.view === 'request') {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });

      closeMobileNav();

      const reqSection = document.getElementById('requestSection');
      if (reqSection) {
        reqSection.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    Object.keys(views).forEach(v => {
      if (views[v]) views[v].style.display = 'none';
    });

    if (views[viewName]) {
      views[viewName].style.display = 'block';
    }

    // Update nav link active states: only the selected view is active
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.dataset.view === viewName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update role chip active states
    document.querySelectorAll('.role-chip').forEach(chip => {
      if (chip.dataset.view === viewName) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });

    // Update mobile bottom tab active states
    document.querySelectorAll('.mobile-tab-btn').forEach(tab => {
      if (tab.dataset.view === viewName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    closeMobileNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Handle view-specific initialization
    if (viewName === 'track') {
      if (param) {
        document.getElementById('trackNumberInput').value = param;
        performTrack(param);
      }
    } else if (viewName === 'courier') {
      const alertBanner = document.getElementById('customerHandoverAlert');
      if (alertBanner) alertBanner.style.display = 'none';
      const activeSection = document.getElementById('activeDeliverySection');
      if (activeSection) activeSection.style.display = 'none';
      initCourierView();
    } else if (viewName === 'account') {
      initAccountView();
    }

    // Check for active sender handover confirmation requests (Customer only)
    if (user?.role !== 'courier') {
      checkActiveSenderHandovers();
    }
  }

  // Bind nav links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      if (view) switchView(view);
    });
  });

  // Bind role switcher chips
  roleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const view = chip.dataset.view;
      if (view) switchView(view);
    });
  });

  // Theme Switching (Delivery Light vs Night Mode)
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('kola_theme') || 'light';
  applyTheme(savedTheme);

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      if (themeToggleBtn) themeToggleBtn.textContent = 'Dark Mode';
    } else {
      document.documentElement.removeAttribute('data-theme');
      if (themeToggleBtn) themeToggleBtn.textContent = 'Delivery Light';
    }
    localStorage.setItem('kola_theme', theme);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
      showToast(`Switched to ${nextTheme === 'light' ? 'Delivery Light' : 'Dark Mode'}`, 'info');
    });
  }

  const navBackdrop = document.getElementById('navBackdrop');

  function openMobileNav() {
    if (navMenu) navMenu.classList.add('mobile-open');
    if (navBackdrop) navBackdrop.style.display = 'block';
    if (mobileNavToggle) mobileNavToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMobileNav() {
    if (navMenu) navMenu.classList.remove('mobile-open');
    if (navBackdrop) navBackdrop.style.display = 'none';
    if (mobileNavToggle) mobileNavToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleMobileNav() {
    if (navMenu && navMenu.classList.contains('mobile-open')) {
      closeMobileNav();
    } else {
      openMobileNav();
    }
  }

  if (mobileNavToggle) {
    mobileNavToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileNav();
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener('click', closeMobileNav);
  }

  // Dismiss mobile drawer when any link inside it is tapped
  document.querySelectorAll('.nav-menu a, .nav-menu button').forEach(el => {
    el.addEventListener('click', () => {
      closeMobileNav();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });

  // ===================================================================
  // 2. HERO ACTIONS & QUICK CHIPS
  // ===================================================================
  const heroRequestBtn = document.getElementById('heroRequestBtn');
  if (heroRequestBtn) {
    heroRequestBtn.addEventListener('click', () => {
      switchView('request');
    });
  }

  const heroTrackBtn = document.getElementById('heroTrackBtn');
  if (heroTrackBtn) {
    heroTrackBtn.addEventListener('click', () => {
      switchView('track');
    });
  }

  // ===================================================================
  // 2. LIVE ADDRESS AUTOCOMPLETE & RESOLUTION (ANY WRITTEN ADDRESS)
  // ===================================================================
  const pickupInput = document.getElementById('pickupLocationInput');
  const deliveryInput = document.getElementById('deliveryLocationInput');
  const pickupDropdown = document.getElementById('pickupSuggestionsDropdown');
  const deliveryDropdown = document.getElementById('deliverySuggestionsDropdown');
  const pickupPill = document.getElementById('pickupResolvedPill');
  const deliveryPill = document.getElementById('deliveryResolvedPill');
  const pickupPillText = document.getElementById('pickupResolvedText');
  const deliveryPillText = document.getElementById('deliveryResolvedText');
  const clearPickupBtn = document.getElementById('clearPickupBtn');
  const clearDeliveryBtn = document.getElementById('clearDeliveryBtn');
  const ambiguityModal = document.getElementById('ambiguityModal');
  const ambiguityModalClose = document.getElementById('ambiguityModalClose');
  const ambiguityCandidatesList = document.getElementById('ambiguityCandidatesList');
  const ambiguityLocationName = document.getElementById('ambiguityLocationName');
  const ambiguityRefineInput = document.getElementById('ambiguityRefineInput');
  const ambiguityRefineBtn = document.getElementById('ambiguityRefineBtn');

  function updateAddressClearButtons() {
    if (clearPickupBtn && pickupInput) {
      clearPickupBtn.style.display = pickupInput.value.trim() ? 'flex' : 'none';
    }
    if (clearDeliveryBtn && deliveryInput) {
      clearDeliveryBtn.style.display = deliveryInput.value.trim() ? 'flex' : 'none';
    }
  }

  if (clearPickupBtn && pickupInput) {
    clearPickupBtn.addEventListener('click', () => {
      pickupInput.value = '';
      selectedPickupCoords = null;
      if (pickupPill) pickupPill.style.display = 'none';
      if (pickupDropdown) pickupDropdown.style.display = 'none';
      updateAddressClearButtons();
      pickupInput.focus();
      triggerQuoteRecalculate();
    });
  }

  if (clearDeliveryBtn && deliveryInput) {
    clearDeliveryBtn.addEventListener('click', () => {
      deliveryInput.value = '';
      selectedDeliveryCoords = null;
      if (deliveryPill) deliveryPill.style.display = 'none';
      if (deliveryDropdown) deliveryDropdown.style.display = 'none';
      updateAddressClearButtons();
      deliveryInput.focus();
      triggerQuoteRecalculate();
    });
  }

  function setupAddressAutocomplete(inputEl, dropdownEl, pillEl, pillTextEl, fieldType) {
    if (!inputEl || !dropdownEl) return;
    let timer = null;

    inputEl.addEventListener('input', () => {
      updateAddressClearButtons();
      const val = inputEl.value.trim();

      // Invalidate existing coords since user is typing new characters
      if (fieldType === 'pickup') {
        selectedPickupCoords = null;
      } else {
        selectedDeliveryCoords = null;
      }
      if (pillEl) pillEl.style.display = 'none';

      clearTimeout(timer);
      if (val.length < 2) {
        dropdownEl.innerHTML = '';
        dropdownEl.style.display = 'none';
        return;
      }

      timer = setTimeout(async () => {
        try {
          const res = await window.kolaApi.deliveries.getSuggestions(val);
          const suggestions = res.suggestions || [];
          if (!suggestions.length) {
            dropdownEl.innerHTML = `
              <div class="suggestion-empty">
                <span>🔍 No exact road match found. You can still use this typed address.</span>
              </div>
            `;
            dropdownEl.style.display = 'block';
            return;
          }

          dropdownEl.innerHTML = suggestions.map((s, idx) => `
            <div class="suggestion-item" data-idx="${idx}">
              <div class="suggestion-icon">📍</div>
              <div class="suggestion-content">
                <div class="suggestion-title-row">
                  <span class="suggestion-name">${escapeHtml(s.title)}</span>
                  ${s.district ? `<span class="suggestion-district-badge">${escapeHtml(s.district)}</span>` : ''}
                </div>
                <div class="suggestion-desc">${escapeHtml(s.display_name)}</div>
              </div>
            </div>
          `).join('');
          dropdownEl.style.display = 'block';

          dropdownEl.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
              const idx = parseInt(item.dataset.idx, 10);
              const chosen = suggestions[idx];
              if (!chosen) return;

              inputEl.value = chosen.title;
              updateAddressClearButtons();
              dropdownEl.style.display = 'none';

              const coords = {
                lat: chosen.lat,
                lng: chosen.lng,
                name: chosen.title
              };

              if (fieldType === 'pickup') {
                selectedPickupCoords = coords;
                if (pillEl && pillTextEl) {
                  pillTextEl.textContent = `📍 Geocoded: ${chosen.title}`;
                  pillEl.style.display = 'inline-flex';
                }
              } else {
                selectedDeliveryCoords = coords;
                if (pillEl && pillTextEl) {
                  pillTextEl.textContent = `🏁 Geocoded: ${chosen.title}`;
                  pillEl.style.display = 'inline-flex';
                }
              }

              triggerQuoteRecalculate();
            });
          });
        } catch (err) {
          console.warn('Suggestions lookup failed:', err);
          dropdownEl.style.display = 'none';
        }
      }, 250);
    });

    inputEl.addEventListener('focus', () => {
      if (dropdownEl.children.length > 0 && inputEl.value.trim().length >= 2) {
        dropdownEl.style.display = 'block';
      }
    });
  }

  setupAddressAutocomplete(pickupInput, pickupDropdown, pickupPill, pickupPillText, 'pickup');
  setupAddressAutocomplete(deliveryInput, deliveryDropdown, deliveryPill, deliveryPillText, 'delivery');

  // Close autocomplete dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (pickupDropdown && !pickupInput?.contains(e.target) && !pickupDropdown.contains(e.target)) {
      pickupDropdown.style.display = 'none';
    }
    if (deliveryDropdown && !deliveryInput?.contains(e.target) && !deliveryDropdown.contains(e.target)) {
      deliveryDropdown.style.display = 'none';
    }
  });

  // Helper escape function
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ===================================================================
  // 3. AMBIGUITY CLARIFICATION MODAL HANDLER
  // ===================================================================
  function openAmbiguityModal(ambiguityData) {
    if (!ambiguityModal) return;
    currentAmbiguityData = ambiguityData;

    const searchTerm = ambiguityData.searched_query || ambiguityData.ambiguous_field || 'address';
    if (ambiguityLocationName) {
      ambiguityLocationName.textContent = searchTerm;
    }

    const fieldLabel = ambiguityData.ambiguous_field === 'delivery' ? 'drop-off destination' : 'pickup point';
    const promptText = document.getElementById('ambiguityPromptText');
    if (promptText) {
      promptText.innerHTML = `Multiple locations in Uganda match "<strong>${escapeHtml(searchTerm)}</strong>". Please select your exact intended ${fieldLabel} below so we can calculate the accurate road distance &amp; ETA:`;
    }

    if (ambiguityCandidatesList) {
      const candidates = ambiguityData.candidates || [];
      if (!candidates.length) {
        ambiguityCandidatesList.innerHTML = `<p style="text-align:center; color:var(--text-muted);">Please refine your address with a specific town, landmark, or street.</p>`;
      } else {
        ambiguityCandidatesList.innerHTML = candidates.map((c, idx) => `
          <div class="candidate-card" data-idx="${idx}">
            <div class="candidate-card-info">
              <div class="candidate-card-title">
                <span>📍 ${escapeHtml(c.title)}</span>
                ${c.district ? `<span class="suggestion-district-badge">${escapeHtml(c.district)}</span>` : ''}
              </div>
              <div class="candidate-card-sub">${escapeHtml(c.display_name)}</div>
            </div>
            <button type="button" class="candidate-card-btn">Select This Location</button>
          </div>
        `).join('');

        ambiguityCandidatesList.querySelectorAll('.candidate-card').forEach(card => {
          card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.idx, 10);
            const candidate = candidates[idx];
            if (!candidate) return;

            applyResolvedCandidate(candidate, ambiguityData.ambiguous_field);
          });
        });
      }
    }

    if (ambiguityRefineInput) {
      ambiguityRefineInput.value = searchTerm;
    }

    ambiguityModal.style.display = 'flex';
  }

  function closeAmbiguityModal() {
    if (ambiguityModal) {
      ambiguityModal.style.display = 'none';
    }
  }

  if (ambiguityModalClose) {
    ambiguityModalClose.addEventListener('click', closeAmbiguityModal);
  }

  if (ambiguityModal) {
    ambiguityModal.addEventListener('click', (e) => {
      if (e.target === ambiguityModal) closeAmbiguityModal();
    });
  }

  function applyResolvedCandidate(candidate, field) {
    const coords = {
      lat: candidate.lat,
      lng: candidate.lng,
      name: candidate.title
    };

    if (field === 'pickup') {
      if (pickupInput) pickupInput.value = candidate.title;
      selectedPickupCoords = coords;
      if (pickupPill && pickupPillText) {
        pickupPillText.textContent = `📍 Geocoded: ${candidate.title}`;
        pickupPill.style.display = 'inline-flex';
      }
    } else {
      if (deliveryInput) deliveryInput.value = candidate.title;
      selectedDeliveryCoords = coords;
      if (deliveryPill && deliveryPillText) {
        deliveryPillText.textContent = `🏁 Geocoded: ${candidate.title}`;
        deliveryPill.style.display = 'inline-flex';
      }
    }

    updateAddressClearButtons();
    closeAmbiguityModal();
    currentAmbiguityData = null;
    triggerQuoteRecalculate();
  }

  if (ambiguityRefineBtn && ambiguityRefineInput) {
    const handleRefine = () => {
      const refined = ambiguityRefineInput.value.trim();
      if (!refined) return;
      const field = currentAmbiguityData?.ambiguous_field || 'pickup';
      if (field === 'pickup') {
        if (pickupInput) pickupInput.value = refined;
        selectedPickupCoords = null;
        if (pickupPill) pickupPill.style.display = 'none';
      } else {
        if (deliveryInput) deliveryInput.value = refined;
        selectedDeliveryCoords = null;
        if (deliveryPill) deliveryPill.style.display = 'none';
      }
      updateAddressClearButtons();
      closeAmbiguityModal();
      currentAmbiguityData = null;
      triggerQuoteRecalculate();
    };

    ambiguityRefineBtn.addEventListener('click', handleRefine);
    ambiguityRefineInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRefine();
      }
    });
  }

  // ===================================================================
  // 4. DYNAMIC DELIVERY PRICING QUOTE CALCULATION (LIVE ROUTING & ETA)
  // ===================================================================
  let currentQuoteError = null;

  function setQuoteError(msg) {
    currentQuoteError = msg;
    currentQuote = null;
    const errBox = document.getElementById('quoteErrorBox');
    const errText = document.getElementById('quoteErrorText');
    if (errBox && errText) {
      errText.textContent = msg;
      errBox.style.display = 'flex';
    }
    const distEl = document.getElementById('quoteDistance');
    if (distEl) distEl.textContent = '— km';
    const etaEl = document.getElementById('quoteEta');
    if (etaEl) etaEl.textContent = '— mins';
    const distFeeEl = document.getElementById('quoteDistanceFee');
    if (distFeeEl) distFeeEl.textContent = '—';
    const totalEl = document.getElementById('quoteTotalFee');
    if (totalEl) totalEl.innerHTML = `—<small>UGX</small>`;
  }

  function clearQuoteError() {
    currentQuoteError = null;
    const errBox = document.getElementById('quoteErrorBox');
    if (errBox) errBox.style.display = 'none';
  }

  function resetQuoteDisplay() {
    clearQuoteError();
    currentQuote = null;
    const distEl = document.getElementById('quoteDistance');
    if (distEl) distEl.textContent = '—';
    const etaEl = document.getElementById('quoteEta');
    if (etaEl) etaEl.textContent = '—';
    const routeTypeEl = document.getElementById('quoteRouteType');
    if (routeTypeEl) routeTypeEl.textContent = 'Enter pickup & drop-off';
    const baseEl = document.getElementById('quoteBaseFee');
    if (baseEl) baseEl.textContent = '—';
    const distFeeEl = document.getElementById('quoteDistanceFee');
    if (distFeeEl) distFeeEl.textContent = '—';
    const totalEl = document.getElementById('quoteTotalFee');
    if (totalEl) totalEl.innerHTML = `—<small>UGX</small>`;
  }

  function triggerQuoteRecalculate() {
    clearTimeout(quoteDebounceTimer);
    const liveIndicator = document.getElementById('quoteLiveIndicator');

    quoteDebounceTimer = setTimeout(async () => {
      const pickup = pickupInput?.value.trim();
      const destination = deliveryInput?.value.trim();
      const category = document.querySelector('input[name="item_category"]:checked')?.value || 'small_parcel';
      const isUrgent = document.getElementById('urgentDeliveryToggle')?.checked || false;

      if (!pickup || !destination) {
        resetQuoteDisplay();
        return;
      }

      if (pickup.toLowerCase() === destination.toLowerCase()) {
        if (liveIndicator) liveIndicator.style.display = 'none';
        setQuoteError('Pickup and drop-off addresses cannot be identical. Please enter distinct locations.');
        return;
      }

      if (liveIndicator) liveIndicator.style.display = 'flex';
      clearQuoteError();

      try {
        const quote = await window.kolaApi.pricing.calculateQuote({
          pickup_location: pickup,
          delivery_location: destination,
          pickup_coords: selectedPickupCoords,
          delivery_coords: selectedDeliveryCoords,
          item_category: category,
          is_urgent: isUrgent
        });

        if (liveIndicator) liveIndicator.style.display = 'none';

        if (quote.ambiguous) {
          currentAmbiguityData = quote;
          openAmbiguityModal(quote);
          return;
        }

        currentAmbiguityData = null;
        clearQuoteError();

        // Auto-update coordinates and geocoded pills if returned
        if (quote.origin && quote.origin.lat) {
          selectedPickupCoords = {
            lat: quote.origin.lat,
            lng: quote.origin.lng,
            name: quote.origin.title || quote.origin.display_name
          };
          if (pickupPill && pickupPillText) {
            pickupPillText.textContent = `📍 Geocoded: ${quote.origin.title || quote.origin.display_name}`;
            pickupPill.style.display = 'inline-flex';
          }
        }

        if (quote.destination && quote.destination.lat) {
          selectedDeliveryCoords = {
            lat: quote.destination.lat,
            lng: quote.destination.lng,
            name: quote.destination.title || quote.destination.display_name
          };
          if (deliveryPill && deliveryPillText) {
            deliveryPillText.textContent = `🏁 Geocoded: ${quote.destination.title || quote.destination.display_name}`;
            deliveryPill.style.display = 'inline-flex';
          }
        }

        currentQuote = quote;
        renderQuote(quote);
      } catch (err) {
        if (liveIndicator) liveIndicator.style.display = 'none';
        const msg = err.data?.error || err.message || 'Unable to calculate live road route.';
        setQuoteError(msg);
      }
    }, 400);
  }

  function renderQuote(quote) {
    const distEl = document.getElementById('quoteDistance');
    if (distEl) distEl.textContent = `${quote.distance_km} km`;

    const etaEl = document.getElementById('quoteEta');
    if (etaEl) {
      const etaMins = quote.duration_minutes || quote.eta_minutes;
      etaEl.textContent = etaMins ? `~${etaMins} mins` : 'Real-time route';
    }

    const routeTypeEl = document.getElementById('quoteRouteType');
    if (routeTypeEl) {
      routeTypeEl.textContent = quote.route_type || 'Live Driving Road Route';
    }

    const badgeEl = document.getElementById('quoteRoutingBadge');
    if (badgeEl) {
      badgeEl.textContent = '⚡ Live Road Routing';
    }

    const baseEl = document.getElementById('quoteBaseFee');
    if (baseEl) baseEl.textContent = `UGX ${quote.base_fee.toLocaleString()}`;

    const distFeeEl = document.getElementById('quoteDistanceFee');
    if (distFeeEl) distFeeEl.textContent = `UGX ${quote.distance_fee.toLocaleString()}`;

    const catRow = document.getElementById('quoteCategoryRow');
    const catFeeEl = document.getElementById('quoteCategoryFee');
    if (catRow) {
      if (quote.category_fee > 0) {
        catRow.style.display = 'flex';
        if (catFeeEl) catFeeEl.textContent = `+ UGX ${quote.category_fee.toLocaleString()}`;
      } else {
        catRow.style.display = 'none';
      }
    }
    
    const urgentRow = document.getElementById('quoteUrgentRow');
    if (urgentRow) {
      if (quote.is_urgent && quote.urgent_fee > 0) {
        urgentRow.style.display = 'flex';
        const urgentFeeEl = document.getElementById('quoteUrgentFee');
        if (urgentFeeEl) urgentFeeEl.textContent = `+ UGX ${quote.urgent_fee.toLocaleString()}`;
      } else {
        urgentRow.style.display = 'none';
      }
    }

    const totalEl = document.getElementById('quoteTotalFee');
    if (totalEl) totalEl.innerHTML = `${quote.total_fee.toLocaleString()}<small>UGX</small>`;
  }

  // Attach live listeners for quote inputs
  ['pickupLocationInput', 'deliveryLocationInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', triggerQuoteRecalculate);
  });

  document.querySelectorAll('input[name="item_category"]').forEach(radio => {
    radio.addEventListener('change', triggerQuoteRecalculate);
  });

  const urgentToggle = document.getElementById('urgentDeliveryToggle');
  if (urgentToggle) urgentToggle.addEventListener('change', triggerQuoteRecalculate);

  updateAddressClearButtons();
  // Initial calculation trigger with default fields
  triggerQuoteRecalculate();

  // ===================================================================
  // 5. DELIVERY REQUEST SUBMISSION (INTEGRATED WITH CASHLESS PAYMENT)
  // ===================================================================
  const deliveryForm = document.getElementById('deliveryRequestForm');
  if (deliveryForm) {
    deliveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Check if there is an unresolved ambiguous address
      if (currentAmbiguityData && currentAmbiguityData.ambiguous) {
        showToast('Please clarify your ambiguous address before proceeding', 'warning');
        openAmbiguityModal(currentAmbiguityData);
        return;
      }

      if (currentQuoteError) {
        showToast(currentQuoteError, 'error');
        return;
      }

      const senderName = document.getElementById('senderNameInput')?.value.trim();
      const senderPhone = document.getElementById('senderPhoneInput')?.value.trim();
      const pickupLocation = pickupInput?.value.trim();
      const pickupDirections = document.getElementById('pickupDirectionsInput')?.value.trim();
      const pickupNotes = document.getElementById('pickupNotesInput')?.value.trim();

      const recipientName = document.getElementById('recipientNameInput')?.value.trim();
      const recipientPhone = document.getElementById('recipientPhoneInput')?.value.trim();
      const deliveryLocation = deliveryInput?.value.trim();
      const deliveryDirections = document.getElementById('deliveryDirectionsInput')?.value.trim();
      const deliveryNotes = document.getElementById('deliveryNotesInput')?.value.trim();

      const itemDescription = document.getElementById('itemDescriptionInput')?.value.trim();
      const itemCategory = document.querySelector('input[name="item_category"]:checked')?.value || 'small_parcel';
      const specialInstructions = document.getElementById('specialInstructionsInput')?.value.trim();
      const isUrgent = document.getElementById('urgentDeliveryToggle')?.checked || false;

      // Validate
      if (!senderName || !senderPhone || !pickupLocation) {
        showToast('Please complete all required sender details', 'warning');
        return;
      }

      if (!recipientName || !recipientPhone || !deliveryLocation) {
        showToast('Please complete all required recipient details', 'warning');
        return;
      }

      if (!itemDescription) {
        showToast('Please provide an item description', 'warning');
        return;
      }

      const submitBtn = document.getElementById('submitRequestBtn');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳ Calculating Road Route &amp; Price...</span>';

      try {
        const payload = {
          sender_name: senderName,
          sender_phone: senderPhone,
          pickup_location: pickupLocation,
          pickup_coords: selectedPickupCoords,
          pickup_directions: pickupDirections,
          pickup_notes: pickupNotes,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          delivery_location: deliveryLocation,
          delivery_coords: selectedDeliveryCoords,
          delivery_directions: deliveryDirections,
          delivery_notes: deliveryNotes,
          item_description: itemDescription,
          item_category: itemCategory,
          special_instructions: specialInstructions,
          is_urgent: isUrgent
        };

        const res = await window.kolaApi.deliveries.create(payload);
        showToast(`Request created! ID: ${res.delivery.tracking_number}`, 'success');

        // Reset delivery form so input fields return to clean blank state
        if (deliveryForm) {
          deliveryForm.reset();
          selectedPickupCoords = null;
          selectedDeliveryCoords = null;
          if (pickupPill) pickupPill.style.display = 'none';
          if (deliveryPill) deliveryPill.style.display = 'none';
          updateAddressClearButtons();
          resetQuoteDisplay();
        }

        // Open Cashless Payment Modal
        openPaymentModal(res.delivery);
      } catch (err) {
        if (err.data && err.data.ambiguous) {
          openAmbiguityModal(err.data);
          showToast(err.data.error || 'Please clarify your address', 'warning');
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  // ===================================================================
  // 5. CASHLESS PAYMENT MODAL (MTN / AIRTEL MOBILE MONEY)
  // ===================================================================
  const paymentModal = document.getElementById('paymentModal');
  const paymentModalClose = document.getElementById('paymentModalClose');

  function openPaymentModal(delivery) {
    activePaymentDelivery = delivery;
    document.getElementById('payDeliveryTracking').textContent = delivery.tracking_number;
    document.getElementById('payAmountDisplay').textContent = `UGX ${delivery.delivery_fee.toLocaleString()}`;
    document.getElementById('payAmountConfirmBtn').textContent = `Pay UGX ${delivery.delivery_fee.toLocaleString()}`;

    // Auto-fill phone with sender phone
    const phoneInput = document.getElementById('payCustomerPhone');
    phoneInput.value = delivery.sender_phone;

    // Detect operator prefix and pre-select radio
    const phone = delivery.sender_phone.replace(/\s+/g, '');
    if (phone.startsWith('070') || phone.startsWith('075') || phone.startsWith('074')) {
      document.getElementById('methodAirtel').checked = true;
    } else {
      document.getElementById('methodMtn').checked = true;
    }

    // Reset STK simulation view
    document.getElementById('stkSimulationBox').style.display = 'none';
    document.getElementById('paymentFormContent').style.display = 'block';

    paymentModal.classList.add('active');
  }

  function closePaymentModal() {
    paymentModal.classList.remove('active');
    if (stkPollingInterval) clearInterval(stkPollingInterval);
  }

  if (paymentModalClose) paymentModalClose.addEventListener('click', closePaymentModal);

  // Submit Payment Initiation
  const cashlessPayBtn = document.getElementById('payAmountConfirmBtn');
  if (cashlessPayBtn) {
    cashlessPayBtn.addEventListener('click', async () => {
      if (!activePaymentDelivery) return;

      const customerPhone = document.getElementById('payCustomerPhone')?.value.trim();
      const method = document.querySelector('input[name="payment_method"]:checked')?.value || 'MTN Mobile Money';

      if (!customerPhone) {
        showToast('Please enter your Mobile Money phone number', 'warning');
        return;
      }

      cashlessPayBtn.disabled = true;
      cashlessPayBtn.textContent = 'Initiating Push...';

      try {
        const initRes = await window.kolaApi.payments.initiate({
          delivery_id: activePaymentDelivery.id,
          payment_method: method,
          customer_phone: customerPhone
        });

        activePaymentRef = initRes.reference_id;

        // Display interactive STK push simulation
        document.getElementById('paymentFormContent').style.display = 'none';
        const stkBox = document.getElementById('stkSimulationBox');
        stkBox.style.display = 'block';
        document.getElementById('stkMessageText').textContent = initRes.ussd_prompt_message;
        document.getElementById('stkRefCode').textContent = `Ref: ${initRes.reference_id}`;

        // Auto-verify trigger simulation after 4 seconds (or user can click button)
        let countdown = 4;
        const countdownTimerEl = document.getElementById('stkCountdownTimer');
        countdownTimerEl.textContent = `Auto-verifying in ${countdown}s...`;

        stkPollingInterval = setInterval(async () => {
          countdown--;
          if (countdown > 0) {
            countdownTimerEl.textContent = `Auto-verifying in ${countdown}s...`;
          } else {
            clearInterval(stkPollingInterval);
            countdownTimerEl.textContent = 'Verifying with Mobile Money network...';
            confirmPayment(activePaymentRef);
          }
        }, 1000);

      } catch (err) {
        showToast(err.message, 'error');
        cashlessPayBtn.disabled = false;
        cashlessPayBtn.textContent = 'Pay Now';
      }
    });
  }

  // Manual trigger "I have entered my PIN" button
  const stkManualVerifyBtn = document.getElementById('stkManualVerifyBtn');
  if (stkManualVerifyBtn) {
    stkManualVerifyBtn.addEventListener('click', () => {
      if (stkPollingInterval) clearInterval(stkPollingInterval);
      if (activePaymentRef) confirmPayment(activePaymentRef);
    });
  }

  async function confirmPayment(referenceId) {
    try {
      const res = await window.kolaApi.payments.verify(referenceId);
      if (res.status === 'Successful') {
        showToast('Payment confirmed! Courier dispatch initiated.', 'success');
        closePaymentModal();
        loadActiveDelivery();
        switchView('home');
      } else {
        showToast('Payment could not be verified: ' + (res.reason || 'Network error'), 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ===================================================================
  // 6. TRACKING EXPERIENCE
  // ===================================================================
  const trackBtn = document.getElementById('trackLookupBtn');
  const trackInput = document.getElementById('trackNumberInput');

  if (trackBtn && trackInput) {
    trackBtn.addEventListener('click', () => {
      const id = trackInput.value.trim();
      if (!id) {
        showToast('Please enter a delivery tracking number', 'warning');
        return;
      }
      performTrack(id);
    });

    trackInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        trackBtn.click();
      }
    });
  }

  async function performTrack(trackingId) {
    const resultWrap = document.getElementById('trackingResultWrap');
    resultWrap.style.display = 'none';

    try {
      const data = await window.kolaApi.deliveries.get(trackingId);
      renderTrackingDetails(data);
      resultWrap.style.display = 'block';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderTrackingDetails({ delivery, courier, history, payment }) {
    document.getElementById('trackDisplayId').textContent = delivery.tracking_number;
    document.getElementById('trackDisplayDate').textContent = new Date(delivery.created_at).toLocaleString();

    // Render Status Stepper & Milestone Flow
    renderStatusStepper(delivery.status);
    renderTimelineMilestones(delivery, history);

    // Handover Confirmation Cards
    const handoverActionCard = document.getElementById('trackHandoverActionCard');
    const handoverVerifiedBox = document.getElementById('trackHandoverVerifiedBox');

    const currentUser = window.kolaApi.auth.getUser();
    const isCourierUser = currentUser?.role === 'courier';
    const isActualSender = currentUser && (
      currentUser.id === delivery.sender_id || 
      currentUser.phone === delivery.sender_phone || 
      currentUser.identifier === delivery.sender_phone
    );

    if (delivery.status === 'Awaiting Sender Confirmation') {
      if (handoverActionCard) {
        // STRICT RULE: Only the sender sees the sender handover confirmation card.
        // Couriers or non-senders must NOT see the sender confirmation prompt.
        if (isActualSender && !isCourierUser) {
          handoverActionCard.style.display = 'block';
        } else {
          handoverActionCard.style.display = 'none';
        }
        const btnConfirm = document.getElementById('btnTrackConfirmHandover');
        const btnDispute = document.getElementById('btnTrackDisputeHandover');

        if (btnConfirm) {
          btnConfirm.onclick = async () => {
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Verifying Handover...';
            try {
              const res = await window.kolaApi.deliveries.confirmHandover(delivery.id);
              showToast(res.message, 'success');
              performTrack(delivery.tracking_number);
              checkActiveSenderHandovers();
            } catch (err) {
              showToast(err.message, 'error');
              btnConfirm.disabled = false;
              btnConfirm.textContent = 'CONFIRM PACKAGE HANDOVER';
            }
          };
        }

        if (btnDispute) {
          btnDispute.onclick = async () => {
            btnDispute.disabled = true;
            try {
              const res = await window.kolaApi.deliveries.disputeHandover(delivery.id);
              showToast(res.message, 'info');
              performTrack(delivery.tracking_number);
            } catch (err) {
              showToast(err.message, 'error');
            } finally {
              btnDispute.disabled = false;
            }
          };
        }
      }
      if (handoverVerifiedBox) handoverVerifiedBox.style.display = 'none';
    } else if (delivery.handover_confirmation_id) {
      if (handoverActionCard) handoverActionCard.style.display = 'none';
      if (handoverVerifiedBox) {
        handoverVerifiedBox.style.display = 'flex';
        document.getElementById('trackHandoverId').textContent = delivery.handover_confirmation_id;
        document.getElementById('trackHandoverTime').textContent = delivery.handover_confirmed_at ? new Date(delivery.handover_confirmed_at).toLocaleString() : 'Confirmed';
      }
    } else {
      if (handoverActionCard) handoverActionCard.style.display = 'none';
      if (handoverVerifiedBox) handoverVerifiedBox.style.display = 'none';
    }

    // SPECIAL RECIPIENT DELIVERY PIN CARD (Given to sender so she can provide it to recipient)
    const pinCard = document.getElementById('trackRecipientPinCard');
    if (pinCard) {
      // Couriers must NEVER see the PIN in the UI or app
      if (isCourierUser || !delivery.delivery_pin) {
        pinCard.style.display = 'none';
      } else {
        pinCard.style.display = 'block';

        const pinStr = String(delivery.delivery_pin || '----').padStart(4, '-');
        const box0 = document.getElementById('pinBox0');
        const box1 = document.getElementById('pinBox1');
        const box2 = document.getElementById('pinBox2');
        const box3 = document.getElementById('pinBox3');
        if (box0) box0.textContent = pinStr[0] || '-';
        if (box1) box1.textContent = pinStr[1] || '-';
        if (box2) box2.textContent = pinStr[2] || '-';
        if (box3) box3.textContent = pinStr[3] || '-';

        const nameEl = document.getElementById('pinRecipientName');
        const phoneEl = document.getElementById('pinRecipientPhone');
        if (nameEl) nameEl.textContent = delivery.recipient_name;
        if (phoneEl) phoneEl.textContent = delivery.recipient_phone;

        const pinStatusPill = document.getElementById('pinStatusIndicator');
        const pinStatusText = document.getElementById('pinStatusText');

        if (delivery.status === 'Delivered' || delivery.delivery_confirmed_by_pin) {
          if (pinStatusPill) pinStatusPill.className = 'pin-status-pill verified';
          const verifiedTime = delivery.pin_verified_at 
            ? new Date(delivery.pin_verified_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';
          if (pinStatusText) {
            pinStatusText.textContent = `✓ Handover Confirmed: Recipient read this PIN upon package arrival${verifiedTime ? ` (${verifiedTime})` : ''}. Delivered to rightful owner!`;
          }
        } else {
          if (pinStatusPill) pinStatusPill.className = 'pin-status-pill pending';
          if (pinStatusText) {
            pinStatusText.textContent = `Awaiting delivery: Recipient ${delivery.recipient_name} will read this PIN to courier upon arrival`;
          }
        }

        // Setup Copy PIN button
        const btnCopyPin = document.getElementById('btnCopyDeliveryPin');
        if (btnCopyPin) {
          btnCopyPin.onclick = async () => {
            try {
              await navigator.clipboard.writeText(delivery.delivery_pin);
              showToast(`Special Delivery PIN copied: ${delivery.delivery_pin}`, 'success');
            } catch (e) {
              showToast(`Delivery PIN: ${delivery.delivery_pin}`, 'info');
            }
          };
        }

        // Setup WhatsApp Share button
        const btnWhatsapp = document.getElementById('btnSharePinWhatsapp');
        if (btnWhatsapp) {
          const cleanPhone = delivery.recipient_phone ? delivery.recipient_phone.replace(/[^0-9]/g, '') : '';
          const intlPhone = cleanPhone.startsWith('0') ? '256' + cleanPhone.slice(1) : cleanPhone;
          const shareMsg = `Hello ${delivery.recipient_name}, your package from ${delivery.sender_name} via Kola Express is en route! Your Special Delivery PIN is ${delivery.delivery_pin}. Please read this PIN to the courier upon arrival to confirm package handover to the rightful owner. Tracking: ${delivery.tracking_number}`;
          btnWhatsapp.href = `https://api.whatsapp.com/send?phone=${intlPhone}&text=${encodeURIComponent(shareMsg)}`;
        }
      }
    }

    // Sender & Pickup
    document.getElementById('trackSenderName').textContent = delivery.sender_name;
    document.getElementById('trackSenderPhone').textContent = delivery.sender_phone;
    document.getElementById('trackPickupLocation').textContent = delivery.pickup_location;
    document.getElementById('trackPickupDirections').textContent = delivery.pickup_directions || 'No special directions given';

    // Recipient & Destination
    document.getElementById('trackRecipientName').textContent = delivery.recipient_name;
    document.getElementById('trackRecipientPhone').textContent = delivery.recipient_phone;
    document.getElementById('trackDeliveryLocation').textContent = delivery.delivery_location;
    document.getElementById('trackDeliveryDirections').textContent = delivery.delivery_directions || 'Call on arrival';

    // Item Details
    document.getElementById('trackItemDesc').textContent = delivery.item_description;
    document.getElementById('trackItemCategory').textContent = delivery.item_category.replace('_', ' ').toUpperCase();
    document.getElementById('trackDeliveryFee').textContent = `UGX ${delivery.delivery_fee.toLocaleString()} (${payment?.payment_method || 'Cashless'})`;
    document.getElementById('trackItemNotes').textContent = delivery.special_instructions || 'Standard handling';

    // Courier Card
    const courierBox = document.getElementById('trackCourierBox');
    if (courier) {
      courierBox.style.display = 'flex';
      document.getElementById('trackCourierName').textContent = courier.full_name;
      document.getElementById('trackCourierRating').textContent = `★ ${courier.rating} (${courier.total_trips} trips)`;
      document.getElementById('trackCourierVehicle').textContent = `${courier.vehicle_type} • Plate: ${courier.plate_number}`;
      document.getElementById('trackCourierCallBtn').href = `tel:${courier.phone}`;
      document.getElementById('trackCourierCallBtn').textContent = `Call ${courier.phone}`;
      const trackAvatar = document.getElementById('trackCourierAvatar');
      if (trackAvatar) {
        const initials = courier.full_name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
        trackAvatar.textContent = initials || 'CR';
      }
    } else {
      courierBox.style.display = 'none';
    }

    // Timeline History
    const timelineList = document.getElementById('trackTimelineList');
    timelineList.innerHTML = '';
    (history || []).forEach(item => {
      const li = document.createElement('li');
      li.className = 'timeline-item';
      li.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-title">${escapeHtml(item.status)}</div>
        <div class="timeline-meta">
          <span>By: ${escapeHtml(item.updated_by)}</span>
          <span>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="timeline-note">${escapeHtml(item.note || '')}</div>
      `;
      timelineList.appendChild(li);
    });
  }

  const ORDERED_STATUSES = [
    { key: 'Request Created', label: 'Request Created' },
    { key: 'Payment Confirmed', label: 'Payment Confirmed' },
    { key: 'Courier Assigned', label: 'Courier Assigned' },
    { key: 'Courier En Route to Pickup', label: 'En Route to Pickup' },
    { key: 'Awaiting Sender Confirmation', label: 'Courier Arrived' },
    { key: 'Package Picked Up', label: 'Handover Confirmed' },
    { key: 'In Transit', label: 'In Transit' },
    { key: 'Near Destination', label: 'Near Destination' },
    { key: 'Delivered', label: 'Delivered' }
  ];

  function renderStatusStepper(currentStatus) {
    const stepper = document.getElementById('statusStepper');
    stepper.innerHTML = '';

    let normalizedStatus = currentStatus;
    if (currentStatus === 'Item Picked Up') normalizedStatus = 'Package Picked Up';
    if (currentStatus === 'Courier Arrived at Pickup') normalizedStatus = 'Awaiting Sender Confirmation';

    const currentIndex = ORDERED_STATUSES.findIndex(s => s.key === normalizedStatus);

    ORDERED_STATUSES.forEach((s, idx) => {
      const node = document.createElement('div');
      node.className = 'step-node';
      
      if (idx < currentIndex) {
        node.classList.add('completed');
      } else if (idx === currentIndex) {
        node.classList.add('active');
      }

      node.innerHTML = `
        <div class="node-icon">${idx < currentIndex ? '✓' : (idx + 1)}</div>
        <div class="node-label">${s.label}</div>
      `;
      stepper.appendChild(node);
    });
  }

  // Copy tracking ID button
  const copyTrackingBtn = document.getElementById('copyTrackingBtn');
  if (copyTrackingBtn) {
    copyTrackingBtn.addEventListener('click', () => {
      const id = document.getElementById('trackDisplayId').textContent;
      navigator.clipboard.writeText(id).then(() => {
        showToast('Tracking ID copied to clipboard!', 'success');
      });
    });
  }

  // ===================================================================
  // 7. COURIER OPERATIONAL PORTAL
  // ===================================================================
  async function initCourierView() {
    const alertBanner = document.getElementById('customerHandoverAlert');
    if (alertBanner) alertBanner.style.display = 'none';

    const user = window.kolaApi.auth.getUser();
    const token = window.kolaApi.auth.getToken();

    if (!token || (user?.role !== 'courier' && user?.role !== 'admin')) {
      document.getElementById('courierAuthCard').style.display = 'block';
      document.getElementById('courierDashboardContent').style.display = 'none';
    } else {
      document.getElementById('courierAuthCard').style.display = 'none';
      document.getElementById('courierDashboardContent').style.display = 'block';
      document.getElementById('courierProfileName').textContent = user.full_name;
      loadCourierTasks();
    }
  }

  const courierLoginForm = document.getElementById('courierLoginForm');
  if (courierLoginForm) {
    courierLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('courierPhoneInput').value.trim();
      const pass = document.getElementById('courierPasswordInput').value;

      try {
        const res = await window.kolaApi.auth.login(phone, pass);
        showToast(`Welcome, ${res.user.full_name}`, 'success');
        checkAuthAndEnforceGate();
        initRealtimeManager();
        switchView('courier');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  let courierTasksDebounceTimer = null;
  let isCourierTasksFetching = false;
  let pendingCourierTasksFetch = false;
  let lastCourierTasksSignature = '';

  function loadCourierTasks(force = false) {
    if (force) {
      clearTimeout(courierTasksDebounceTimer);
      executeLoadCourierTasks(true);
      return;
    }

    clearTimeout(courierTasksDebounceTimer);
    courierTasksDebounceTimer = setTimeout(() => {
      executeLoadCourierTasks(false);
    }, 120);
  }

  async function executeLoadCourierTasks(force = false) {
    const taskContainer = document.getElementById('courierTasksContainer');
    if (!taskContainer) return;

    if (isCourierTasksFetching) {
      pendingCourierTasksFetch = true;
      return;
    }

    isCourierTasksFetching = true;

    // Check if the container already has cards or content rendered
    const hasExistingContent = taskContainer.children.length > 0 && taskContainer.innerHTML.trim() !== '';

    // Only render full loading indicator if container is empty or user explicitly requested a force reload
    if (!hasExistingContent || force) {
      taskContainer.innerHTML = '<div style="text-align:center; padding: 2.5rem; color:var(--text-muted);"><div class="spinner" style="margin: 0 auto 0.75rem auto; width: 26px; height: 26px; border: 3px solid rgba(0,0,0,0.1); border-top-color: var(--kola-blue); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>Loading assigned deliveries...</div>';
    }

    try {
      const deliveries = await window.kolaApi.courier.getMyDeliveries();
      if (!deliveries || deliveries.length === 0) {
        lastCourierTasksSignature = 'empty';
        taskContainer.innerHTML = `
          <div class="form-card" style="text-align: center; padding: 3rem;">
            <h3>No deliveries currently assigned.</h3>
            <p style="color: var(--text-muted); margin-top: 0.5rem;">New assignments dispatched from admin will appear here automatically in real time.</p>
          </div>
        `;
        return;
      }

      // Compute data signature to detect if any actual delivery state or handover status has changed
      const newSignature = JSON.stringify(deliveries.map(del => ({
        id: del.id,
        status: del.status,
        courier_confirmed_received: !!del.courier_confirmed_received,
        sender_confirmed_handover: !!del.sender_confirmed_handover,
        handover_status: del.handover_status,
        handover_confirmation_id: del.handover_confirmation_id || '',
        tracking_number: del.tracking_number
      })));

      // If data is identical and tasks are already rendered, do NOT wipe or re-render DOM!
      if (!force && hasExistingContent && newSignature === lastCourierTasksSignature) {
        return;
      }

      // Preserve any active input values (like courier entering 4-digit PIN)
      const savedInputValues = {};
      let activeElementId = null;
      if (document.activeElement && document.activeElement.id && document.activeElement.closest('#courierTasksContainer')) {
        activeElementId = document.activeElement.id;
      }
      taskContainer.querySelectorAll('input').forEach(input => {
        if (input.id && input.value) {
          savedInputValues[input.id] = input.value;
        }
      });

      lastCourierTasksSignature = newSignature;
      taskContainer.innerHTML = '';
      deliveries.forEach(del => {
        const card = document.createElement('div');
        card.className = 'courier-task-card';

        const isDelivered = del.status === 'Delivered';
        let actionBtnHtml = '';

        if (del.status === 'Courier Assigned' || del.status === 'Payment Confirmed' || del.status === 'Request Created') {
          actionBtnHtml = `<button class="btn-primary task-action-btn" data-id="${del.id}" data-status="Courier En Route to Pickup" style="background:var(--kola-blue); color:white; font-weight:800; padding:0.6rem 1.25rem;">I am heading to Pickup</button>`;
        } else if (del.status === 'Courier En Route to Pickup') {
          actionBtnHtml = `<button class="btn-primary task-arrive-btn" data-id="${del.id}" style="background:var(--kola-blue); color:white; font-weight:800; padding:0.6rem 1.25rem;">📍 I've Arrived</button>`;
        } else if (del.status === 'Awaiting Sender Confirmation') {
          if (del.courier_confirmed_received) {
            actionBtnHtml = `
              <div class="courier-handover-card" style="background: rgba(16, 185, 129, 0.08); border: 1.5px solid #10b981; border-radius: 10px; padding: 0.85rem 1rem; max-width: 480px;">
                <div style="font-weight: 800; font-size: 0.9rem; color: #047857; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.45rem;">
                  <span>✓</span> <span>PACKAGE HANDOVER CONFIRMED BY COURIER</span>
                </div>
                <p style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 0.65rem;">
                  You confirmed that sender <strong>${escapeHtml(del.sender_name)}</strong> physically handed over the package to you.
                </p>
                <div style="font-size: 0.8rem; color: #b45309; font-weight: 700; margin-bottom: 0.65rem; background: rgba(245, 158, 11, 0.12); padding: 0.45rem 0.75rem; border-radius: 6px;">
                  ⏳ Waiting for sender ${escapeHtml(del.sender_name)} to tap "Confirm Package Handover" on their phone to unlock transit.
                </div>
                <button type="button" class="btn-secondary task-refresh-btn" style="padding: 0.45rem 0.9rem; font-size: 0.8rem;">🔄 Check Sender Confirmation</button>
              </div>
            `;
          } else {
            actionBtnHtml = `
              <div class="courier-handover-card" style="background: rgba(37, 99, 235, 0.08); border: 1.5px solid var(--kola-blue); border-radius: 10px; padding: 0.9rem 1.1rem; max-width: 520px;">
                <div style="font-weight: 800; font-size: 0.95rem; color: var(--kola-blue-dark); margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.45rem;">
                  <span>📦</span> <strong>PACKAGE HANDOVER AT PICKUP</strong>
                </div>
                <p style="font-size: 0.875rem; margin-bottom: 0.75rem; color: var(--text-main); line-height: 1.45;">
                  Have you been handed over the package by sender <strong>${escapeHtml(del.sender_name)}</strong>?
                  <br>
                  <span style="font-size: 0.8rem; color: var(--text-muted);">Please confirm if yes once the package has physically been given to you.</span>
                </p>
                ${del.handover_status === 'disputed' 
                  ? `<div style="font-size: 0.8rem; color: #dc2626; font-weight: 700; background: rgba(239, 68, 68, 0.12); border-radius: 6px; padding: 0.45rem 0.75rem; margin-bottom: 0.65rem;">⚠️ Sender reported package has not yet been given to you. Please meet the sender and collect the item.</div>` 
                  : ''}
                <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center;">
                  <button type="button" class="btn-primary task-courier-confirm-btn" data-id="${del.id}" style="background: var(--kola-blue); color: white; font-weight: 800; padding: 0.65rem 1.2rem; font-size: 0.85rem; border-radius: 8px;">
                    YES — I HAVE RECEIVED THE PACKAGE
                  </button>
                  <button type="button" class="btn-secondary task-courier-notyet-btn" data-id="${del.id}" style="padding: 0.65rem 1rem; font-size: 0.825rem; border-radius: 8px;">
                    NO — NOT YET RECEIVED
                  </button>
                  <button type="button" class="btn-secondary task-refresh-btn" style="padding: 0.65rem 0.85rem; font-size: 0.8rem; border-radius: 8px;" title="Check if sender confirmed">
                    🔄
                  </button>
                </div>
              </div>
            `;
          }
        } else if (del.status === 'Package Picked Up' || del.status === 'Item Picked Up') {
          actionBtnHtml = `
            <div style="display:flex; flex-direction:column; gap:0.45rem;">
              <div style="background:rgba(16,185,129,0.12); border:1px solid #10b981; border-radius:8px; padding:0.45rem 0.8rem; font-size:0.825rem; color:#047857; font-weight:700;">
                ✓ Sender Confirmed Handover ${del.handover_confirmation_id ? `(${del.handover_confirmation_id})` : ''}
              </div>
              <button class="btn-primary task-action-btn" data-id="${del.id}" data-status="In Transit" style="background:var(--kola-blue); color:white; font-weight:800; padding:0.6rem 1.25rem;">Start Transit →</button>
            </div>
          `;
        } else if (del.status === 'In Transit') {
          actionBtnHtml = `
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
              <button class="btn-primary task-action-btn" data-id="${del.id}" data-status="Near Destination" style="background:var(--kola-blue); color:white; font-weight:800; padding:0.6rem 1.25rem;">
                📍 Arrived Near Destination
              </button>
            </div>
          `;
        } else if (del.status === 'Near Destination') {
          actionBtnHtml = `
            <div class="courier-pin-box" style="background:rgba(16,185,129,0.06); border:1.5px solid #10b981; border-radius:10px; padding:0.95rem 1.15rem; width:100%; max-width:540px;">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                <span style="font-size:1.15rem;">🔐</span>
                <strong style="font-size:0.925rem; color:#047857;">RECIPIENT DELIVERY CONFIRMATION</strong>
              </div>
              <p style="font-size:0.85rem; color:var(--text-main); margin-bottom:0.75rem; line-height:1.45;">
                Ask recipient <strong>${escapeHtml(del.recipient_name)}</strong> to read out the <strong>Special Delivery PIN</strong> given to them by sender <strong>${escapeHtml(del.sender_name)}</strong>.
              </p>
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                <input type="text" maxlength="4" pattern="[0-9]*" inputmode="numeric" 
                       id="courierPinInput_${del.id}" 
                       class="form-input courier-pin-input-field" 
                       placeholder="Enter 4-digit PIN" 
                       style="max-width:170px; font-size:1.15rem; font-weight:800; letter-spacing:0.25em; text-align:center; padding:0.55rem 0.75rem; font-family:monospace; background:white;" />
                <button type="button" class="btn-primary task-verify-pin-btn" data-id="${del.id}" 
                        style="background:var(--emerald-gradient); color:#060913; font-weight:800; padding:0.65rem 1.25rem; box-shadow:0 0 16px rgba(0,229,163,0.35);">
                  VERIFY PIN &amp; DELIVER
                </button>
              </div>
              <div style="font-size:0.775rem; color:var(--text-muted); margin-top:0.5rem;">
                ⚠️ Only hand over the package after entering the correct PIN provided by the recipient.
              </div>
            </div>
          `;
        } else if (isDelivered) {
          actionBtnHtml = `
            <div style="background:rgba(16,185,129,0.12); border:1px solid #10b981; border-radius:8px; padding:0.55rem 0.95rem; font-size:0.85rem; color:#047857; font-weight:700; display:flex; align-items:center; gap:0.45rem;">
              <span>✓</span> Delivered to Rightful Owner (Verified with Special PIN)
            </div>
          `;
        }

        card.innerHTML = `
          <div class="courier-task-header">
            <div>
              <span class="tracking-id-tag" style="font-size:1.15rem;">${del.tracking_number}</span>
              <span style="font-size:0.825rem; color:var(--text-muted); margin-left:0.5rem;">${del.item_description}</span>
            </div>
            <span class="badge ${isDelivered ? 'badge-success' : 'badge-warning'}">${del.status}</span>
          </div>

          <div class="task-stop-row">
            <div class="task-stop">
              <div class="stop-tag pickup">1. Pickup Point</div>
              <div style="font-weight:800; margin-bottom:0.2rem;">${escapeHtml(del.pickup_location)}</div>
              <div style="font-size:0.825rem; color:var(--text-muted); margin-bottom:0.5rem;">${escapeHtml(del.pickup_directions || 'No special directions')}</div>
              <div style="font-size:0.85rem; font-weight:700;">Sender: ${escapeHtml(del.sender_name)}</div>
              <a href="tel:${del.sender_phone}" class="courier-call-btn" style="margin-top:0.4rem; padding:0.3rem 0.75rem;">📞 Call Sender (${del.sender_phone})</a>
            </div>

            <div class="task-stop">
              <div class="stop-tag drop">2. Destination</div>
              <div style="font-weight:800; margin-bottom:0.2rem;">${escapeHtml(del.delivery_location)}</div>
              <div style="font-size:0.825rem; color:var(--text-muted); margin-bottom:0.5rem;">${escapeHtml(del.delivery_directions || 'Call on arrival')}</div>
              <div style="font-size:0.85rem; font-weight:700;">Recipient: ${escapeHtml(del.recipient_name)}</div>
              <a href="tel:${del.recipient_phone}" class="courier-call-btn" style="margin-top:0.4rem; padding:0.3rem 0.75rem; background:var(--kola-gradient); color:#060913;">📞 Call Recipient (${del.recipient_phone})</a>
            </div>
          </div>

          <div class="courier-actions-bar">
            ${actionBtnHtml}
            <button class="btn-secondary" onclick="window.kolaApp.viewTrack('${del.tracking_number}')" style="margin-left:auto; padding:0.55rem 1rem; font-size:0.85rem;">View Full Details</button>
          </div>
        `;

        taskContainer.appendChild(card);
      });

      // Bind status update buttons
      taskContainer.querySelectorAll('.task-action-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const status = btn.dataset.status;
          btn.disabled = true;
          try {
            await window.kolaApi.courier.updateStatus(id, status);
            showToast(`Status updated: ${status}`, 'success');
            loadCourierTasks();
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });

      // Bind I've Arrived button
      taskContainer.querySelectorAll('.task-arrive-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = "Recording arrival...";
          try {
            const res = await window.kolaApi.courier.markArrived(id);
            showToast(res.message, 'success');
            loadCourierTasks();
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = "📍 I've Arrived";
          }
        });
      });

      // Bind Courier Confirm Receipt ("YES — I HAVE RECEIVED THE PACKAGE")
      taskContainer.querySelectorAll('.task-courier-confirm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = 'Recording receipt...';
          try {
            const res = await window.kolaApi.courier.confirmReceipt(id);
            showToast(res.message, 'success');
            loadCourierTasks();
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = 'YES — I HAVE RECEIVED THE PACKAGE';
          }
        });
      });

      // Bind Courier Not Yet Received ("NO — NOT YET RECEIVED")
      taskContainer.querySelectorAll('.task-courier-notyet-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          btn.disabled = true;
          try {
            const res = await window.kolaApi.courier.reportNotReceived(id);
            showToast(res.message, 'info');
            loadCourierTasks();
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });

      // Bind Courier Verify PIN and Deliver ("VERIFY PIN & DELIVER")
      taskContainer.querySelectorAll('.task-verify-pin-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const pinInput = document.getElementById(`courierPinInput_${id}`);
          const pin = pinInput ? pinInput.value.trim() : '';

          if (!pin) {
            showToast('Please enter the 4-digit PIN read to you by the recipient.', 'warning');
            if (pinInput) pinInput.focus();
            return;
          }

          if (pin.length !== 4) {
            showToast('Delivery PIN must be exactly 4 digits.', 'warning');
            if (pinInput) pinInput.focus();
            return;
          }

          btn.disabled = true;
          const origText = btn.textContent;
          btn.textContent = 'Verifying PIN...';

          try {
            const res = await window.kolaApi.courier.verifyPinAndDeliver(id, pin);
            showToast(res.message, 'success');
            loadCourierTasks();
          } catch (err) {
            showToast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = origText;
            if (pinInput) {
              pinInput.focus();
              pinInput.select();
            }
          }
        });
      });

      // Allow pressing Enter inside PIN input
      taskContainer.querySelectorAll('.courier-pin-input-field').forEach(input => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const btn = input.parentElement.querySelector('.task-verify-pin-btn');
            if (btn) btn.click();
          }
        });
      });

      // Bind Refresh buttons
      taskContainer.querySelectorAll('.task-refresh-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          loadCourierTasks(true);
          showToast('Delivery status refreshed', 'info');
        });
      });

      // Restore preserved inputs and active focus
      Object.keys(savedInputValues).forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) inputEl.value = savedInputValues[id];
      });
      if (activeElementId) {
        const activeEl = document.getElementById(activeElementId);
        if (activeEl) activeEl.focus();
      }

    } catch (err) {
      if (!hasExistingContent) {
        taskContainer.innerHTML = `<div style="color:var(--danger-red); padding: 1.5rem;">${escapeHtml(err.message)}</div>`;
      } else {
        console.warn('[Courier Tasks Sync Error]', err.message);
      }
    } finally {
      isCourierTasksFetching = false;
      if (pendingCourierTasksFetch) {
        pendingCourierTasksFetch = false;
        setTimeout(() => executeLoadCourierTasks(false), 80);
      }
    }
  }



  // ===================================================================
  // 9. CUSTOMER ACCOUNT VIEW
  // ===================================================================
  async function initAccountView() {
    const user = window.kolaApi.auth.getUser();
    if (user) {
      document.getElementById('accountAuthCards').style.display = 'none';
      document.getElementById('accountDashboard').style.display = 'block';
      document.getElementById('accountUserName').textContent = user.full_name;
      document.getElementById('accountUserPhone').textContent = user.phone;
      loadCustomerDeliveries();
    } else {
      document.getElementById('accountAuthCards').style.display = 'block';
      document.getElementById('accountDashboard').style.display = 'none';
    }
  }

  const customerLoginForm = document.getElementById('customerLoginForm');
  if (customerLoginForm) {
    customerLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('customerLoginPhone').value.trim();
      const pass = document.getElementById('customerLoginPassword').value;

      try {
        const res = await window.kolaApi.auth.login(identifier, pass);
        showToast(`Welcome back, ${res.user.full_name}`, 'success');
        checkAuthAndEnforceGate();
        initRealtimeManager();
        if (res.user.role === 'courier') {
          switchView('courier');
          initCourierView();
          loadCourierTasks();
        } else {
          initAccountView();
          switchView('home');
          loadActiveDelivery();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const customerRegisterForm = document.getElementById('customerRegisterForm');
  if (customerRegisterForm) {
    customerRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const full_name = document.getElementById('regNameInput').value.trim();
      const identifier = document.getElementById('regPhoneInput').value.trim();
      const password = document.getElementById('regPasswordInput').value;

      try {
        const res = await window.kolaApi.auth.register({ full_name, identifier, password });
        showToast(`Account created for ${res.user.full_name}`, 'success');
        initAccountView();
        checkAuthAndEnforceGate();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function loadCustomerDeliveries() {
    const listContainer = document.getElementById('customerDeliveriesList');
    if (!listContainer) return;

    if (listContainer.children.length === 0 || listContainer.innerHTML.trim() === '') {
      listContainer.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading your delivery requests...</div>';
    }

    try {
      const deliveries = await window.kolaApi.deliveries.list();
      listContainer.innerHTML = '';

      if (deliveries.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">You have not created any deliveries yet.</div>';
        return;
      }

      deliveries.forEach(d => {
        const card = document.createElement('div');
        card.className = 'form-card';
        card.style.marginBottom = '1.25rem';

        let handoverHtml = '';
        if (d.status === 'Awaiting Sender Confirmation') {
          handoverHtml = `
            <div class="handover-action-prompt" style="margin-top:0.85rem; padding:0.95rem; border-radius:10px; background:rgba(255,183,3,0.12); border:1.5px solid var(--accent-gold);">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.35rem;">
                <span class="handover-pulse-dot" style="background:#f59e0b; width:9px; height:9px; border-radius:50%; display:inline-block;"></span>
                <strong style="font-size:0.95rem; color:#b45309;">PACKAGE HANDOVER CONFIRMATION</strong>
              </div>
              <p style="font-size:0.875rem; margin-bottom:0.75rem; color:var(--text-main);">
                Your courier has arrived to collect your package. <strong>Only confirm after you have physically handed the package to the courier.</strong>
              </p>
              ${d.handover_status === 'disputed' ? `<p style="font-size:0.825rem; color:#dc2626; margin-bottom:0.6rem; font-weight:700;">The sender has not yet confirmed package handover. Please hand the physical package to the courier.</p>` : ''}
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                <button type="button" class="btn-handover-confirm" onclick="window.kolaApp.confirmHandover(${d.id})" style="padding:0.6rem 1.15rem; font-size:0.85rem;">CONFIRM PACKAGE HANDOVER</button>
                <button type="button" class="btn-handover-dispute" onclick="window.kolaApp.disputeHandover(${d.id})" style="padding:0.6rem 1rem; font-size:0.825rem;">I HAVE NOT HANDED OVER THE PACKAGE</button>
              </div>
            </div>
          `;
        } else if (d.handover_confirmation_id) {
          handoverHtml = `
            <div style="margin-top:0.65rem; font-size:0.825rem; color:#059669; font-weight:700; display:flex; align-items:center; gap:0.4rem;">
              <span>✓ Sender Confirmed Handover</span>
              <span style="font-family:monospace; background:#ecfdf5; padding:0.15rem 0.45rem; border-radius:4px; border:1px solid #a7f3d0; color:#065f46;">${d.handover_confirmation_id}</span>
            </div>
          `;
        }

        let pinHtml = '';
        if (d.delivery_pin) {
          const isDelivered = d.status === 'Delivered' || d.delivery_confirmed_by_pin;
          pinHtml = `
            <div style="margin-top:0.75rem; background:rgba(37,99,235,0.06); border:1.5px dashed var(--kola-blue); border-radius:8px; padding:0.6rem 0.85rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span style="font-size:0.95rem;">🔐</span>
                <span style="font-size:0.8rem; font-weight:700; color:var(--text-main);">Recipient Delivery PIN:</span>
                <span style="font-family:monospace; font-size:1.15rem; font-weight:800; color:var(--kola-blue-dark); letter-spacing:0.15em; background:white; padding:0.15rem 0.55rem; border-radius:5px; border:1px solid rgba(37,99,235,0.2);">${d.delivery_pin}</span>
                <span style="font-size:0.775rem; color:var(--text-muted);">(Share with recipient ${escapeHtml(d.recipient_name)})</span>
              </div>
              <div style="display:flex; gap:0.4rem; align-items:center;">
                <button type="button" class="copy-btn" onclick="navigator.clipboard.writeText('${d.delivery_pin}'); window.kolaApp.showToast('Delivery PIN copied: ${d.delivery_pin}', 'success');" style="font-size:0.775rem; padding:0.25rem 0.65rem;">Copy PIN</button>
                ${isDelivered ? '<span style="font-size:0.75rem; color:#059669; font-weight:700;">✓ Verified on delivery</span>' : ''}
              </div>
            </div>
          `;
        }

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
            <strong style="color:var(--kola-blue-dark); font-size:1.05rem; font-weight:800;">${d.tracking_number}</strong>
            <span class="badge ${getStatusBadgeClass(d.status)}">${d.status}</span>
          </div>
          <div style="font-size:0.875rem; margin-bottom:0.5rem;">
            From: <strong>${escapeHtml(d.pickup_location)}</strong> → To: <strong>${escapeHtml(d.delivery_location)}</strong>
          </div>
          <div style="font-size:0.825rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
            <span>Fee: UGX ${d.delivery_fee.toLocaleString()}</span>
            <button class="copy-btn" onclick="window.kolaApp.viewTrack('${d.tracking_number}')">View Live Tracking</button>
          </div>
          ${handoverHtml}
          ${pinHtml}
        `;
        listContainer.appendChild(card);
      });
    } catch (err) {
      listContainer.innerHTML = `<div style="color:var(--danger-red);">${err.message}</div>`;
    }
  }

  // Logout Buttons
  document.querySelectorAll('.logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.kolaApi.auth.logout();
      window.kolaApi.realtime.disconnect();
      isRealtimeManagerInitialized = false;
      lastCourierTasksSignature = '';
      const taskContainer = document.getElementById('courierTasksContainer');
      if (taskContainer) taskContainer.innerHTML = '';
      const activeSec = document.getElementById('activeDeliverySection');
      if (activeSec) activeSec.style.display = 'none';
      showToast('Logged out of Kola Express', 'info');
      checkAuthAndEnforceGate();
    });
  });

  // ===================================================================
  // 8. MANDATORY ACCESS GATE HANDLERS
  // ===================================================================
  const tabGateRegister = document.getElementById('tabGateRegister');
  const tabGateLogin = document.getElementById('tabGateLogin');
  const gateRegisterForm = document.getElementById('gateRegisterForm');
  const gateLoginForm = document.getElementById('gateLoginForm');
  const gateGoToLogin = document.getElementById('gateGoToLogin');
  const gateGoToRegister = document.getElementById('gateGoToRegister');

  function resetPasswordToggles(container = document) {
    if (!container) return;
    const wraps = container.querySelectorAll('.password-input-wrap');
    wraps.forEach(wrap => {
      const input = wrap.querySelector('input');
      const btn = wrap.querySelector('.password-toggle-btn');
      if (input && input.type === 'text') {
        input.type = 'password';
      }
      if (btn) {
        const showIcon = btn.querySelector('.eye-show');
        const hideIcon = btn.querySelector('.eye-hide');
        if (showIcon) showIcon.style.display = 'block';
        if (hideIcon) hideIcon.style.display = 'none';
        btn.setAttribute('aria-label', 'Show password');
        btn.setAttribute('title', 'Show password');
      }
    });
  }

  function showGateRegisterTab() {
    if (tabGateRegister) tabGateRegister.classList.add('active');
    if (tabGateLogin) tabGateLogin.classList.remove('active');
    if (gateRegisterForm) {
      gateRegisterForm.style.display = 'block';
      resetPasswordToggles(gateRegisterForm);
    }
    if (gateLoginForm) gateLoginForm.style.display = 'none';
  }

  function showGateLoginTab() {
    if (tabGateLogin) tabGateLogin.classList.add('active');
    if (tabGateRegister) tabGateRegister.classList.remove('active');
    if (gateLoginForm) {
      gateLoginForm.style.display = 'block';
      resetPasswordToggles(gateLoginForm);
    }
    if (gateRegisterForm) gateRegisterForm.style.display = 'none';
  }

  if (tabGateRegister) tabGateRegister.addEventListener('click', showGateRegisterTab);
  if (tabGateLogin) tabGateLogin.addEventListener('click', showGateLoginTab);
  if (gateGoToLogin) gateGoToLogin.addEventListener('click', showGateLoginTab);
  if (gateGoToRegister) gateGoToRegister.addEventListener('click', showGateRegisterTab);

  if (window.location.hash === '#courier' || window.location.search.includes('courier')) {
    showGateLoginTab();
  }

  if (gateRegisterForm) {
    gateRegisterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('gateRegFullName').value.trim();
      const identifier = document.getElementById('gateRegIdentifier').value.trim();
      const password = document.getElementById('gateRegPassword').value;
      const errorDiv = document.getElementById('gateRegError');
      const submitBtn = document.getElementById('gateRegSubmitBtn');

      if (errorDiv) errorDiv.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Creating Account...</span>';
      }

      try {
        const res = await window.kolaApi.auth.register({
          full_name: fullName,
          identifier,
          password
        });
        showToast(`Welcome to Kola Express, ${res.user.full_name}!`, 'success');
        checkAuthAndEnforceGate();
        initRealtimeManager();
        loadActiveDelivery();
        switchView('home');
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Register &amp; Unlock Site Interface →</span>';
        }
      }
    });
  }

  if (gateLoginForm) {
    gateLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = document.getElementById('gateLoginIdentifier').value.trim();
      const password = document.getElementById('gateLoginPassword').value;
      const errorDiv = document.getElementById('gateLoginError');
      const submitBtn = document.getElementById('gateLoginSubmitBtn');

      if (errorDiv) errorDiv.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Verifying...</span>';
      }

      try {
        const res = await window.kolaApi.auth.login(identifier, password);
        showToast(`Welcome back, ${res.user.full_name}!`, 'success');
        checkAuthAndEnforceGate();
        initRealtimeManager();
        if (res.user.role === 'courier') {
          switchView('courier');
          initCourierView();
          loadCourierTasks();
        } else {
          switchView('home');
          loadActiveDelivery();
        }
      } catch (err) {
        if (errorDiv) {
          errorDiv.textContent = err.message;
          errorDiv.style.display = 'block';
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Log In &amp; Access Kola Express →</span>';
        }
      }
    });
  }

  // Universal Password Visibility Toggle Event Handler
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.password-toggle-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const wrap = btn.closest('.password-input-wrap');
    const input = wrap ? wrap.querySelector('input') : (btn.dataset.target ? document.getElementById(btn.dataset.target) : null);
    if (!input) return;

    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';

    const showIcon = btn.querySelector('.eye-show');
    const hideIcon = btn.querySelector('.eye-hide');
    if (showIcon && hideIcon) {
      showIcon.style.display = isPass ? 'none' : 'block';
      hideIcon.style.display = isPass ? 'block' : 'none';
    }

    const label = isPass ? 'Hide password' : 'Show password';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);

    // Keep focus on input for typing convenience
    try {
      input.focus();
      const valLen = input.value.length;
      input.setSelectionRange(valLen, valLen);
    } catch (_) {}
  });

  // Sender Package Handover Global Alert Checker (Customer App only)
  async function checkActiveSenderHandovers() {
    const alertBanner = document.getElementById('customerHandoverAlert');
    if (!alertBanner) return;

    const user = window.kolaApi.auth.getUser();
    const courierView = document.getElementById('view-courier');
    const isCourierViewOpen = courierView && courierView.style.display !== 'none';

    if (!user || user.role === 'courier' || isCourierViewOpen) {
      alertBanner.style.display = 'none';
      return;
    }

    try {
      const deliveries = await window.kolaApi.deliveries.list();
      // STRICT: Only display the alert to the actual sender of this delivery
      const awaiting = (deliveries || []).find(d => 
        d.status === 'Awaiting Sender Confirmation' && 
        (d.sender_id === user.id || d.sender_phone === user.phone || d.sender_phone === user.identifier)
      );

      if (awaiting) {
        alertBanner.style.display = 'block';
        const alertText = document.getElementById('handoverAlertText');
        if (alertText) {
          alertText.innerHTML = `Your courier has arrived to collect delivery <strong>${escapeHtml(awaiting.tracking_number)}</strong>.<br><span class="handover-rule-text">Only confirm after you have physically handed the package to the courier.</span>`;
        }

        const disputeMsg = document.getElementById('handoverDisputeMsg');
        if (disputeMsg) {
          disputeMsg.style.display = awaiting.handover_status === 'disputed' ? 'block' : 'none';
        }

        const btnConfirm = document.getElementById('btnAlertConfirmHandover');
        const btnDispute = document.getElementById('btnAlertDisputeHandover');

        if (btnConfirm) {
          btnConfirm.onclick = async () => {
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Verifying Handover...';
            try {
              const res = await window.kolaApi.deliveries.confirmHandover(awaiting.id);
              showToast(res.message, 'success');
              alertBanner.style.display = 'none';
              checkActiveSenderHandovers();
              if (document.getElementById('view-account')?.style.display !== 'none') {
                loadCustomerDeliveries();
              }
            } catch (err) {
              showToast(err.message, 'error');
            } finally {
              btnConfirm.disabled = false;
              btnConfirm.textContent = 'CONFIRM PACKAGE HANDOVER';
            }
          };
        }

        if (btnDispute) {
          btnDispute.onclick = async () => {
            btnDispute.disabled = true;
            try {
              const res = await window.kolaApi.deliveries.disputeHandover(awaiting.id);
              showToast(res.message, 'info');
              if (disputeMsg) disputeMsg.style.display = 'block';
              if (document.getElementById('view-account')?.style.display !== 'none') {
                loadCustomerDeliveries();
              }
            } catch (err) {
              showToast(err.message, 'error');
            } finally {
              btnDispute.disabled = false;
            }
          };
        }
      } else {
        alertBanner.style.display = 'none';
      }
    } catch (err) {
      // Ignore background fetch error
    }
  }

  // Global helper on window
  window.kolaApp = {
    showToast,
    viewTrack(id) {
      switchView('track', id);
    },
    switchView,
    handleBrandClick,
    checkAuthAndEnforceGate,
    checkActiveSenderHandovers,
    refreshCourierTasks() {
      loadCourierTasks();
    },
    async confirmHandover(deliveryId) {
      try {
        const res = await window.kolaApi.deliveries.confirmHandover(deliveryId);
        showToast(res.message, 'success');
        checkActiveSenderHandovers();
        loadCustomerDeliveries();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
    async disputeHandover(deliveryId) {
      try {
        const res = await window.kolaApi.deliveries.disputeHandover(deliveryId);
        showToast(res.message, 'info');
        checkActiveSenderHandovers();
        loadCustomerDeliveries();
      } catch (err) {
        showToast(err.message, 'error');
      }
    },
    loadActiveDelivery() {
      loadActiveDelivery();
    }
  };

  // ===================================================================
  // 9. AUTHORITATIVE REALTIME & ACTIVE DELIVERY DASHBOARD ENGINE
  // ===================================================================
  let currentActiveDelivery = null;

  function getStageIndex(status) {
    switch (status) {
      case 'Request Created':
      case 'Awaiting Payment':
      case 'Payment Confirmed':
        return 1;
      case 'Courier Assigned':
      case 'Courier En Route to Pickup':
        return 2;
      case 'Awaiting Sender Confirmation':
      case 'Package Picked Up':
      case 'Item Picked Up':
        return 3;
      case 'In Transit':
        return 4;
      case 'Near Destination':
        return 5;
      case 'Delivered':
        return 6;
      default:
        return 1;
    }
  }

  function updateActiveProgressNodes(currentStatus) {
    const currentStage = getStageIndex(currentStatus);
    const fillBar = document.getElementById('adProgressBarFill');
    if (fillBar) {
      const percentages = { 1: '8%', 2: '26%', 3: '46%', 4: '66%', 5: '86%', 6: '100%' };
      fillBar.style.width = percentages[currentStage] || '15%';
    }

    const nodes = document.querySelectorAll('.ad-stage-node');
    nodes.forEach(node => {
      const stage = Number(node.dataset.stage);
      const circle = node.querySelector('.node-circle');
      node.classList.remove('completed', 'active');

      if (stage < currentStage) {
        node.classList.add('completed');
        if (circle) circle.textContent = '✓';
      } else if (stage === currentStage) {
        node.classList.add('active');
        if (circle) circle.textContent = currentStatus === 'Delivered' ? '✓' : '●';
      } else {
        if (circle) circle.textContent = '○';
      }
    });
  }

  function renderTimelineMilestones(delivery, history) {
    const flowContainer = document.getElementById('timelineMilestonesFlow');
    if (!flowContainer) return;

    const currentStatus = delivery.status;
    const currentStage = getStageIndex(currentStatus);

    const statusBadge = document.getElementById('timelineStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = currentStatus;
    }

    const courierText = delivery.courier_name 
      ? `Assigned to ${delivery.courier_name} (${delivery.courier_plate || 'Boda Boda'})` 
      : 'Assigning nearest verified courier';

    const milestones = [
      { stage: 1, title: 'Order Placed', desc: 'Delivery request created and cashless payment verified', matchStatuses: ['Request Created', 'Awaiting Payment', 'Payment Confirmed'] },
      { stage: 2, title: 'Courier Assigned', desc: courierText, matchStatuses: ['Courier Assigned', 'Courier En Route to Pickup'] },
      { stage: 3, title: 'Package Picked Up', desc: 'Physical package handover confirmed at pickup location', matchStatuses: ['Awaiting Sender Confirmation', 'Package Picked Up', 'Item Picked Up'] },
      { stage: 4, title: 'In Transit', desc: 'Package is securely on the way towards destination', matchStatuses: ['In Transit'] },
      { stage: 5, title: 'Arrived Near Destination', desc: `Courier arrived at destination area (${delivery.delivery_location})`, matchStatuses: ['Near Destination'] },
      { stage: 6, title: 'Delivered', desc: 'Package verified with Special Delivery PIN and delivered', matchStatuses: ['Delivered'] }
    ];

    flowContainer.innerHTML = milestones.map(m => {
      let stateClass = '';
      let markerSymbol = '○';

      if (m.stage < currentStage) {
        stateClass = 'completed';
        markerSymbol = '✓';
      } else if (m.stage === currentStage) {
        stateClass = 'active';
        markerSymbol = currentStatus === 'Delivered' ? '✓' : '●';
      }

      let timeText = '';
      if (history && history.length > 0) {
        const histItem = history.find(h => m.matchStatuses.includes(h.status));
        if (histItem) {
          timeText = new Date(histItem.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }

      return `
        <div class="milestone-item ${stateClass}">
          <div class="milestone-marker">${markerSymbol}</div>
          <div class="milestone-content">
            <div class="milestone-title">
              <span>${m.title}</span>
              ${stateClass === 'active' ? '<span class="timeline-status-badge" style="font-size:0.65rem; padding:0.15rem 0.5rem; margin-left:0.4rem;">CURRENT STAGE</span>' : ''}
            </div>
            ${timeText ? `<span class="milestone-time">${timeText}</span>` : ''}
            <div class="milestone-desc">${m.desc}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  function playNotificationChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    } catch (e) {}
  }

  function showDeliveryStatusNotification(payload) {
    const container = document.getElementById('deliveryNotificationContainer');
    if (!container) return;

    const { delivery, latest_update, status_meta, courier } = payload;
    const status = delivery?.status || 'Update';
    const trackingNumber = delivery?.tracking_number || '';

    playNotificationChime();

    const notif = document.createElement('div');
    notif.className = 'delivery-status-notification';

    let iconType = 'transit';
    if (status === 'Delivered') iconType = 'delivered';
    else if (['Near Destination', 'Awaiting Sender Confirmation'].includes(status)) iconType = 'arrived';

    notif.innerHTML = `
      <div class="ds-icon-box ${iconType}">
        ${status_meta?.icon || '📦'}
      </div>
      <div class="ds-content">
        <div class="ds-title">
          <span>${escapeHtml(status_meta?.title || status)}</span>
          <button type="button" class="ds-close-btn" aria-label="Dismiss">✕</button>
        </div>
        <p class="ds-message">${escapeHtml(status_meta?.message || latest_update?.note || 'Delivery status updated.')}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="ds-ref">Kola Express #${escapeHtml(trackingNumber)}</span>
          <button type="button" class="ad-copy-btn" onclick="window.kolaApp.viewTrack('${trackingNumber}')" style="padding:0.15rem 0.5rem; font-size:0.7rem;">View Live Tracking</button>
        </div>
      </div>
    `;

    const closeBtn = notif.querySelector('.ds-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        notif.classList.add('closing');
        setTimeout(() => notif.remove(), 260);
      };
    }

    container.appendChild(notif);

    setTimeout(() => {
      if (notif.parentNode) {
        notif.classList.add('closing');
        setTimeout(() => notif.remove(), 260);
      }
    }, 8000);
  }

  async function loadActiveDelivery() {
    const user = window.kolaApi.auth.getUser();
    const activeSection = document.getElementById('activeDeliverySection');
    if (!activeSection) return;

    if (!user || user.role === 'courier') {
      activeSection.style.display = 'none';
      return;
    }

    try {
      const res = await window.kolaApi.deliveries.getActive();
      if (!res || !res.active || !res.delivery) {
        currentActiveDelivery = null;
        activeSection.style.display = 'none';
        return;
      }

      currentActiveDelivery = res;
      renderActiveDeliveryCard(res);
      activeSection.style.display = 'block';
    } catch (err) {
      // Quiet background failure
    }
  }

  function renderActiveDeliveryCard(data) {
    const user = window.kolaApi.auth.getUser();
    const activeSection = document.getElementById('activeDeliverySection');
    if (!activeSection) return;

    if (!user || user.role === 'courier') {
      activeSection.style.display = 'none';
      return;
    }

    const { delivery, courier, latest_update, eta_text, status_meta } = data;
    if (!delivery) {
      activeSection.style.display = 'none';
      return;
    }

    activeSection.style.display = 'block';

    // Tracking Number / Ref
    const trkEl = document.getElementById('adTrackingNumber');
    if (trkEl) {
      trkEl.textContent = `Kola Express #${delivery.tracking_number}`;
    }

    // Copy button
    const copyBtn = document.getElementById('adCopyTrackingBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(delivery.tracking_number);
        showToast(`Tracking reference copied: ${delivery.tracking_number}`, 'success');
      };
    }

    // Status Pill & Icon
    const statusPill = document.getElementById('adStatusPill');
    const statusIcon = document.getElementById('adStatusIcon');
    const statusName = document.getElementById('adStatusName');
    if (statusPill && statusName) {
      statusName.textContent = delivery.status.toUpperCase();
      if (statusIcon) statusIcon.textContent = status_meta?.icon || '📦';

      statusPill.className = 'ad-status-pill';
      if (['Delivered', 'Package Picked Up', 'Payment Confirmed'].includes(delivery.status)) {
        statusPill.classList.add('status-green');
      } else if (['Awaiting Sender Confirmation', 'Near Destination'].includes(delivery.status)) {
        statusPill.classList.add('status-amber');
      } else {
        statusPill.classList.add('status-blue');
      }
    }

    // Headline & Description
    const headlineEl = document.getElementById('adStatusHeadline');
    const descEl = document.getElementById('adStatusDesc');
    if (headlineEl) headlineEl.textContent = status_meta?.headline || `Status: ${delivery.status}`;
    if (descEl) descEl.textContent = status_meta?.message || latest_update?.note || 'Your package is in progress.';

    // ETA Badge
    const etaVal = document.getElementById('adEtaValue');
    if (etaVal) {
      etaVal.textContent = eta_text || `${delivery.eta_minutes || 20} mins`;
    }

    // 6-Stage Progress Nodes
    updateActiveProgressNodes(delivery.status);

    // Courier Details
    const courierAssignedInfo = document.getElementById('adCourierAssignedInfo');
    const courierUnassignedNotice = document.getElementById('adCourierUnassignedNotice');
    const courierNameEl = document.getElementById('adCourierName');
    const courierVehicleEl = document.getElementById('adCourierVehicle');
    const courierRatingEl = document.getElementById('adCourierRating');
    const courierPhoneBtn = document.getElementById('adCourierPhoneBtn');

    if (courier && courier.name) {
      if (courierAssignedInfo) courierAssignedInfo.style.display = 'block';
      if (courierUnassignedNotice) courierUnassignedNotice.style.display = 'none';
      if (courierNameEl) courierNameEl.textContent = courier.name;
      if (courierVehicleEl) courierVehicleEl.textContent = `${courier.vehicle || 'Boda Boda'} • Plate: ${courier.plate || '—'}`;
      if (courierRatingEl) courierRatingEl.textContent = `★ ${courier.rating || 4.9} (${courier.total_trips || 0} trips)`;
      if (courierPhoneBtn) {
        courierPhoneBtn.href = `tel:${courier.phone}`;
        courierPhoneBtn.textContent = `📞 Call ${courier.phone}`;
      }
      const courierAvatarEl = document.getElementById('adCourierAvatar');
      if (courierAvatarEl) {
        const initials = courier.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
        courierAvatarEl.textContent = initials || 'CR';
      }
    } else {
      if (courierAssignedInfo) courierAssignedInfo.style.display = 'none';
      if (courierUnassignedNotice) courierUnassignedNotice.style.display = 'flex';
    }

    // Locations
    const pickupEl = document.getElementById('adPickupLocation');
    const pickupDirEl = document.getElementById('adPickupDirections');
    const dropoffEl = document.getElementById('adDropoffLocation');
    const dropoffDirEl = document.getElementById('adDropoffDirections');
    if (pickupEl) pickupEl.textContent = delivery.pickup_location || '—';
    if (pickupDirEl) pickupDirEl.textContent = delivery.pickup_directions || 'Standard pickup';
    if (dropoffEl) dropoffEl.textContent = delivery.delivery_location || '—';
    if (dropoffDirEl) dropoffDirEl.textContent = delivery.delivery_directions || 'Call on arrival';

    // Latest Update Box
    const latestTimeEl = document.getElementById('adLatestUpdateTime');
    const latestMsgEl = document.getElementById('adLatestUpdateMsg');
    const latestMetaEl = document.getElementById('adLatestUpdateMeta');
    if (latestTimeEl) {
      latestTimeEl.textContent = latest_update?.formatted_time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (latestMsgEl) {
      latestMsgEl.textContent = latest_update?.note || status_meta?.message || delivery.status;
    }
    if (latestMetaEl) {
      latestMetaEl.textContent = latest_update?.updated_by ? `Updated by ${latest_update.updated_by}` : 'Kola Dispatch System';
    }

    // Contextual Handover Action Buttons
    const handoverBar = document.getElementById('adHandoverActionButtons');
    if (handoverBar) {
      if (delivery.status === 'Awaiting Sender Confirmation') {
        handoverBar.style.display = 'flex';
        const btnConfirm = document.getElementById('btnAdConfirmHandover');
        const btnDispute = document.getElementById('btnAdDisputeHandover');
        if (btnConfirm) {
          btnConfirm.onclick = async () => {
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Verifying Handover...';
            try {
              const res = await window.kolaApi.deliveries.confirmHandover(delivery.id);
              showToast(res.message, 'success');
              loadActiveDelivery();
            } catch (e) {
              showToast(e.message, 'error');
            } finally {
              btnConfirm.disabled = false;
              btnConfirm.textContent = '✓ CONFIRM PACKAGE HANDOVER';
            }
          };
        }
        if (btnDispute) {
          btnDispute.onclick = async () => {
            btnDispute.disabled = true;
            try {
              const res = await window.kolaApi.deliveries.disputeHandover(delivery.id);
              showToast(res.message, 'info');
              loadActiveDelivery();
            } catch (e) {
              showToast(e.message, 'error');
            } finally {
              btnDispute.disabled = false;
            }
          };
        }
      } else {
        handoverBar.style.display = 'none';
      }
    }

    // Recipient PIN box
    const pinContainer = document.getElementById('adPinContainer');
    const pinCodeEl = document.getElementById('adDeliveryPin');
    const btnCopyPin = document.getElementById('btnAdCopyPin');
    const btnShareWhatsapp = document.getElementById('btnAdShareWhatsapp');

    if (delivery.delivery_pin) {
      if (pinContainer) pinContainer.style.display = 'flex';
      if (pinCodeEl) pinCodeEl.textContent = delivery.delivery_pin;
      if (btnCopyPin) {
        btnCopyPin.onclick = () => {
          navigator.clipboard.writeText(delivery.delivery_pin);
          showToast(`Special Recipient PIN copied: ${delivery.delivery_pin}`, 'success');
        };
      }
      if (btnShareWhatsapp) {
        const cleanPhone = delivery.recipient_phone ? delivery.recipient_phone.replace(/[^0-9]/g, '') : '';
        const intlPhone = cleanPhone.startsWith('0') ? '256' + cleanPhone.slice(1) : cleanPhone;
        const shareMsg = `Hello ${delivery.recipient_name}, your package from ${delivery.sender_name} via Kola Express is en route! Your Special Delivery PIN is ${delivery.delivery_pin}. Please read this PIN to the courier upon arrival. Tracking: ${delivery.tracking_number}`;
        btnShareWhatsapp.href = `https://api.whatsapp.com/send?phone=${intlPhone}&text=${encodeURIComponent(shareMsg)}`;
      }
    } else {
      if (pinContainer) pinContainer.style.display = 'none';
    }

    // View full tracking button
    const btnTrack = document.getElementById('btnAdViewTracking');
    if (btnTrack) {
      btnTrack.onclick = () => {
        switchView('track', delivery.tracking_number);
      };
    }
  }

  let isRealtimeManagerInitialized = false;

  function initRealtimeManager() {
    const user = window.kolaApi.auth.getUser();
    if (!user) return;

    window.kolaApi.realtime.connect();

    if (isRealtimeManagerInitialized) return;
    isRealtimeManagerInitialized = true;

    window.kolaApi.realtime.on('status', ({ status }) => {
      const adRealtimePill = document.getElementById('adRealtimePill');
      const adRealtimeStatus = document.getElementById('adRealtimeStatus');
      if (adRealtimePill && adRealtimeStatus) {
        adRealtimePill.className = `ad-realtime-pill ${status}`;
        if (status === 'connected') {
          adRealtimeStatus.textContent = 'Realtime Connected';
        } else if (status === 'connecting' || status === 'reconnecting') {
          adRealtimeStatus.textContent = 'Reconnecting...';
        } else {
          adRealtimeStatus.textContent = 'Offline';
        }
      }
    });

    window.kolaApi.realtime.on('connected', () => {
      // Re-fetch latest authoritative active delivery on reconnect to prevent stale data
      loadActiveDelivery();
      const currentUser = window.kolaApi.auth.getUser();
      if (currentUser?.role === 'courier' || currentUser?.role === 'admin' || (views.courier && views.courier.style.display !== 'none')) {
        loadCourierTasks();
      }
    });

    window.kolaApi.realtime.on('delivery_status_update', (payload) => {
      if (!payload || !payload.delivery) return;

      console.log('⚡ Immediate Realtime Delivery Update:', payload.delivery.tracking_number, payload.delivery.status);

      // Show prominent floating toast notification for important live delivery events (skip on initial startup payload)
      if (!payload.is_initial) {
        showDeliveryStatusNotification(payload);
      }

      // Immediately update the customer's Active Delivery dashboard card (customers/admins only)
      const currentUser = window.kolaApi.auth.getUser();
      if (currentUser?.role !== 'courier') {
        renderActiveDeliveryCard(payload);
        checkActiveSenderHandovers();
      }

      // If user is currently on Tracking page, refresh tracking details in-place
      const trackingResultWrap = document.getElementById('trackingResultWrap');
      const trackDisplayId = document.getElementById('trackDisplayId');
      if (trackingResultWrap && trackingResultWrap.style.display !== 'none' && trackDisplayId) {
        if (trackDisplayId.textContent.trim() === payload.delivery.tracking_number) {
          performTrack(payload.delivery.tracking_number);
        }
      }

      // If customer is on My Account page, refresh deliveries list
      const accountDashboard = document.getElementById('accountDashboard');
      if (accountDashboard && accountDashboard.style.display !== 'none') {
        loadCustomerDeliveries();
      }

      // If courier or admin, or on Courier Tasks page, refresh courier tasks smoothly
      if (currentUser?.role === 'courier' || currentUser?.role === 'admin' || (views.courier && views.courier.style.display !== 'none')) {
        loadCourierTasks();
      }
    });
  }

  // Enforce access gate on initial page load
  const isInitiallyAuthenticated = checkAuthAndEnforceGate();
  if (isInitiallyAuthenticated) {
    const user = window.kolaApi.auth.getUser();
    initRealtimeManager();
    if (user?.role === 'courier') {
      switchView('courier');
    } else {
      switchView('home');
      loadActiveDelivery();
      checkActiveSenderHandovers();
    }
  }

  // Network offline and online listeners for seamless reconnection
  window.addEventListener('online', () => {
    showToast('Internet connection restored — Synchronizing live delivery state...', 'success');
    window.kolaApi.realtime.connect();
    const currentUser = window.kolaApi.auth.getUser();
    if (currentUser?.role === 'courier' || (views.courier && views.courier.style.display !== 'none')) {
      loadCourierTasks();
    } else {
      loadActiveDelivery();
    }
  });

  window.addEventListener('offline', () => {
    showToast('Internet connection dropped — Operating offline until network returns', 'warning');
    const adRealtimePill = document.getElementById('adRealtimePill');
    const adRealtimeStatus = document.getElementById('adRealtimeStatus');
    if (adRealtimePill) adRealtimePill.className = 'ad-realtime-pill disconnected';
    if (adRealtimeStatus) adRealtimeStatus.textContent = 'Offline';
  });

  // Background fallback synchronization check (in case WebSocket or SSE is paused by browser tab sleep)
  setInterval(() => {
    const currentUser = window.kolaApi.auth.getUser();
    if (currentUser?.role === 'courier' || (views.courier && views.courier.style.display !== 'none')) {
      loadCourierTasks();
    } else {
      loadActiveDelivery();
      checkActiveSenderHandovers();
    }
  }, 25000);

  // ===================================================================
  // 10. UTILITIES
  // ===================================================================
  function getStatusBadgeClass(status) {
    if (status === 'Delivered') return 'badge-success';
    if (status === 'Cancelled') return 'badge-danger';
    if (status === 'Awaiting Sender Confirmation') return 'badge-warning';
    if (['In Transit', 'Near Destination', 'Package Picked Up', 'Item Picked Up'].includes(status)) return 'badge-info';
    return 'badge-warning';
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');
    toast.innerHTML = `<span style="font-weight:bold; font-size:1.1rem;">${icon}</span> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  window.showToast = showToast;

  // ===================================================================
  // 11. PASSWORD RECOVERY MANAGER (EMAIL VERIFICATION)
  // ===================================================================
  const modalRecovery = document.getElementById('modalPasswordRecovery');
  const formStep1 = document.getElementById('recoveryStep1Form');
  const formStep2 = document.getElementById('recoveryStep2Form');
  const formStep3 = document.getElementById('recoveryStep3Form');
  const viewSuccess = document.getElementById('recoverySuccessView');

  const inputRecoveryIdentifier = document.getElementById('recoveryIdentifierInput');
  const inputRecoveryCode = document.getElementById('recoveryCodeInput');
  const inputRecoveryNewPass = document.getElementById('recoveryNewPassword');
  const inputRecoveryConfPass = document.getElementById('recoveryConfirmPassword');

  const errStep1 = document.getElementById('recoveryStep1Error');
  const errStep2 = document.getElementById('recoveryStep2Error');
  const errStep3 = document.getElementById('recoveryStep3Error');

  const targetMaskedEmail = document.getElementById('recoveryTargetMaskedEmail');
  const btnCloseRecovery = document.getElementById('closeRecoveryModalBtn');
  const btnBackStep1 = document.getElementById('recoveryBackToStep1Btn');
  const btnResend = document.getElementById('recoveryResendBtn');
  const btnRecoveryDone = document.getElementById('recoveryDoneBtn');

  let activeRecoveryToken = null;
  let activeRecoveryIdentifier = '';

  function openPasswordRecoveryModal(prefilledIdentifier = '') {
    if (!modalRecovery) return;
    activeRecoveryToken = null;
    activeRecoveryIdentifier = prefilledIdentifier;

    // Reset forms & views
    if (formStep1) { formStep1.reset(); formStep1.style.display = 'block'; }
    if (formStep2) { formStep2.reset(); formStep2.style.display = 'none'; }
    if (formStep3) { formStep3.reset(); formStep3.style.display = 'none'; }
    if (viewSuccess) viewSuccess.style.display = 'none';

    if (errStep1) errStep1.style.display = 'none';
    if (errStep2) errStep2.style.display = 'none';
    if (errStep3) errStep3.style.display = 'none';

    if (inputRecoveryIdentifier && prefilledIdentifier) {
      inputRecoveryIdentifier.value = prefilledIdentifier;
    }

    modalRecovery.style.display = 'flex';
    modalRecovery.classList.add('active');
    setTimeout(() => {
      if (inputRecoveryIdentifier) inputRecoveryIdentifier.focus();
    }, 100);
  }

  function closePasswordRecoveryModal() {
    if (!modalRecovery) return;
    modalRecovery.style.display = 'none';
    modalRecovery.classList.remove('active');
    activeRecoveryToken = null;
    activeRecoveryIdentifier = '';
  }

  if (btnCloseRecovery) btnCloseRecovery.addEventListener('click', closePasswordRecoveryModal);
  if (btnRecoveryDone) btnRecoveryDone.addEventListener('click', () => {
    closePasswordRecoveryModal();
    const gateLoginId = document.getElementById('gateLoginIdentifier');
    if (gateLoginId && activeRecoveryIdentifier) {
      gateLoginId.value = activeRecoveryIdentifier;
      const pass = document.getElementById('gateLoginPassword');
      if (pass) pass.focus();
    }
  });

  // Open triggers
  document.querySelectorAll('.recovery-open-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      let candidate = '';
      const gateLoginInput = document.getElementById('gateLoginIdentifier');
      const custLoginInput = document.getElementById('customerLoginPhone');
      const courLoginInput = document.getElementById('courierPhoneInput');

      if (gateLoginInput && gateLoginInput.value.trim()) candidate = gateLoginInput.value.trim();
      else if (custLoginInput && custLoginInput.value.trim()) candidate = custLoginInput.value.trim();
      else if (courLoginInput && courLoginInput.value.trim()) candidate = courLoginInput.value.trim();

      openPasswordRecoveryModal(candidate);
    });
  });

  // Step 1: Send recovery code
  if (formStep1) {
    formStep1.addEventListener('submit', async (e) => {
      e.preventDefault();
      const identifier = inputRecoveryIdentifier ? inputRecoveryIdentifier.value.trim() : '';
      if (!identifier) return;

      if (errStep1) errStep1.style.display = 'none';
      const btn = document.getElementById('recoveryStep1SubmitBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span>Sending Code...</span>'; }

      try {
        const res = await window.kolaApi.auth.forgotPassword(identifier);
        activeRecoveryIdentifier = identifier;
        activeRecoveryToken = res.token || null;

        if (targetMaskedEmail) {
          targetMaskedEmail.textContent = res.masked_email || 'your registered email';
        }

        formStep1.style.display = 'none';
        if (formStep2) {
          formStep2.style.display = 'block';
          if (inputRecoveryCode) {
            inputRecoveryCode.value = '';
            inputRecoveryCode.focus();
          }
        }
        showToast(res.message || 'Recovery code sent to your email!', 'success');
      } catch (err) {
        if (errStep1) {
          errStep1.textContent = err.message;
          errStep1.style.display = 'block';
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span>Send Recovery Code to Email →</span>'; }
      }
    });
  }

  // Step 2: Verify code
  if (formStep2) {
    formStep2.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputRecoveryCode ? inputRecoveryCode.value.trim() : '';
      if (!code) return;

      if (errStep2) errStep2.style.display = 'none';
      const btn = document.getElementById('recoveryStep2SubmitBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span>Verifying Code...</span>'; }

      try {
        const res = await window.kolaApi.auth.verifyResetCode(activeRecoveryIdentifier, code, activeRecoveryToken);
        if (res.token) activeRecoveryToken = res.token;

        formStep2.style.display = 'none';
        if (formStep3) {
          formStep3.style.display = 'block';
          if (inputRecoveryNewPass) {
            inputRecoveryNewPass.value = '';
            inputRecoveryNewPass.focus();
          }
        }
        showToast('Code verified! Enter your new password.', 'success');
      } catch (err) {
        if (errStep2) {
          errStep2.textContent = err.message;
          errStep2.style.display = 'block';
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span>Verify Code &amp; Continue →</span>'; }
      }
    });
  }

  // Step 2 Back / Resend
  if (btnBackStep1) {
    btnBackStep1.addEventListener('click', () => {
      if (formStep2) formStep2.style.display = 'none';
      if (formStep1) {
        formStep1.style.display = 'block';
        if (inputRecoveryIdentifier) inputRecoveryIdentifier.focus();
      }
    });
  }

  if (btnResend) {
    btnResend.addEventListener('click', async () => {
      if (!activeRecoveryIdentifier) return;
      btnResend.disabled = true;
      btnResend.textContent = 'Resending...';
      try {
        const res = await window.kolaApi.auth.forgotPassword(activeRecoveryIdentifier);
        activeRecoveryToken = res.token || activeRecoveryToken;
        showToast('A fresh recovery code was sent to your email.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnResend.disabled = false;
        btnResend.textContent = 'Resend Code';
      }
    });
  }

  // Step 3: Set new password
  if (formStep3) {
    formStep3.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPass = inputRecoveryNewPass ? inputRecoveryNewPass.value : '';
      const confPass = inputRecoveryConfPass ? inputRecoveryConfPass.value : '';

      if (errStep3) errStep3.style.display = 'none';

      if (newPass !== confPass) {
        if (errStep3) {
          errStep3.textContent = 'Passwords do not match. Please re-enter.';
          errStep3.style.display = 'block';
        } else {
          showToast('Passwords do not match', 'error');
        }
        return;
      }

      if (newPass.length < 4) {
        if (errStep3) {
          errStep3.textContent = 'Password must be at least 4 characters long.';
          errStep3.style.display = 'block';
        } else {
          showToast('Password too short', 'error');
        }
        return;
      }

      const btn = document.getElementById('recoveryStep3SubmitBtn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span>Updating Password...</span>'; }

      try {
        const res = await window.kolaApi.auth.resetPassword({
          token: activeRecoveryToken,
          code: inputRecoveryCode ? inputRecoveryCode.value.trim() : '',
          new_password: newPass
        });

        formStep3.style.display = 'none';
        if (viewSuccess) viewSuccess.style.display = 'block';
        showToast(res.message || 'Password successfully updated!', 'success');
      } catch (err) {
        if (errStep3) {
          errStep3.textContent = err.message;
          errStep3.style.display = 'block';
        } else {
          showToast(err.message, 'error');
        }
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<span>Update Password &amp; Finish →</span>'; }
      }
    });
  }

  // Check direct URL hash reset token (e.g. http://localhost:3000/#reset-token=...)
  function checkUrlResetToken() {
    const hash = window.location.hash || '';
    if (hash.includes('reset-token=')) {
      const match = hash.match(/reset-token=([a-f0-9]+)/i);
      if (match && match[1]) {
        activeRecoveryToken = match[1];
        if (modalRecovery) {
          if (formStep1) formStep1.style.display = 'none';
          if (formStep2) formStep2.style.display = 'none';
          if (formStep3) {
            formStep3.style.display = 'block';
            if (inputRecoveryNewPass) inputRecoveryNewPass.focus();
          }
          modalRecovery.style.display = 'flex';
          modalRecovery.classList.add('active');
          showToast('Verified recovery link! Please enter your new password.', 'info');
        }
      }
    }
  }

  checkUrlResetToken();
  window.addEventListener('hashchange', checkUrlResetToken);

});
