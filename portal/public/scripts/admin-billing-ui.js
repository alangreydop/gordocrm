(function () {
  var FISCAL_FIELDS = [
    'taxId',
    'taxIdType',
    'legalName',
    'addressLine1',
    'addressLine2',
    'city',
    'postalCode',
    'region',
    'country',
  ];
  var fiscalState = {};
  var paymentCache = new Map();

  function resolveApiBase() {
    var configured = window.__CRM_API_BASE__;
    if (configured) return configured;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8787';
    }
    return window.location.origin;
  }

  var API_BASE = resolveApiBase();

  function api(path, options) {
    return fetch(API_BASE + path, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }, options || {})).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || 'API error: ' + res.status);
        });
      }
      return res.json();
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeFiscal(raw) {
    var data = raw && raw.client ? raw.client : raw || {};
    var normalized = {};
    FISCAL_FIELDS.forEach(function (field) {
      normalized[field] = data[field] == null ? '' : data[field];
    });
    if (!normalized.country) normalized.country = 'ES';
    return normalized;
  }

  function detectTaxIdType(value) {
    var taxId = String(value || '').trim().toUpperCase();
    if (/^[XYZ]\d{7}[A-Z]$/i.test(taxId)) return 'NIE';
    if (/^\d{8}[A-Z]$/i.test(taxId)) return 'NIF';
    if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/i.test(taxId)) return 'CIF';
    return '';
  }

  function taxIdIsValid(value) {
    if (!value) return true;
    return Boolean(detectTaxIdType(value));
  }

  function paymentLabel(status) {
    return {
      no_invoice: 'Sin factura',
      pending: 'Pago pendiente',
      paid: 'Pagado',
      overdue: 'Vencida',
    }[status] || status || 'Sin factura';
  }

  function paymentClass(status) {
    return {
      no_invoice: 'crm-badge crm-badge-payment-none',
      pending: 'crm-badge crm-badge-payment-pending',
      paid: 'crm-badge crm-badge-payment-paid',
      overdue: 'crm-badge crm-badge-payment-overdue',
    }[status] || 'crm-badge crm-badge-payment-none';
  }

  function fiscalInput(name, label, attrs) {
    attrs = attrs || '';
    return '' +
      '<div>' +
        '<label for="fiscal-' + name + '" class="block text-sm font-medium text-crm-muted mb-1">' + label + '</label>' +
        '<input id="fiscal-' + name + '" name="' + name + '" class="crm-input" ' + attrs + ' />' +
      '</div>';
  }

  function installFetchPreserver(clientId) {
    if (window.__billingUiFetchPreserver) return;
    window.__billingUiFetchPreserver = true;
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : input && input.url;
        var method = String((init && init.method) || 'GET').toUpperCase();
        if (url && method === 'PATCH' && url.indexOf('/api/portal/clients/' + encodeURIComponent(clientId)) !== -1 && url.indexOf('/portal-access') === -1 && init && init.body) {
          var body = JSON.parse(init.body);
          FISCAL_FIELDS.forEach(function (field) {
            if (body[field] === undefined && fiscalState[field] !== undefined) {
              body[field] = fiscalState[field] === '' ? null : fiscalState[field];
            }
          });
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
  }

  function syncFiscalForm() {
    var taxId = document.getElementById('fiscal-taxId');
    var badge = document.getElementById('fiscal-tax-id-type');
    var label = document.getElementById('fiscal-tax-id-label');
    var error = document.getElementById('fiscal-tax-id-error');
    var type = detectTaxIdType(taxId && taxId.value);
    fiscalState.taxIdType = type || '';
    if (badge) {
      badge.textContent = type || 'Sin identificar';
      badge.className = 'crm-badge ' + (type ? 'crm-badge-invoice-issued' : 'crm-badge-default');
    }
    if (label) {
      label.textContent = type ? type + ' fiscal' : 'NIF/CIF/NIE';
    }
    if (error) {
      var invalid = taxId && taxId.value.trim() && !type;
      error.textContent = invalid ? 'Formato de NIF, NIE o CIF no valido.' : '';
      error.classList.toggle('hidden', !invalid);
    }
  }

  function setFiscalValues(data) {
    fiscalState = normalizeFiscal(data);
    FISCAL_FIELDS.forEach(function (field) {
      var input = document.getElementById('fiscal-' + field);
      if (input) input.value = fiscalState[field] || '';
    });
    syncFiscalForm();
  }

  function readFiscalValues() {
    var values = {};
    FISCAL_FIELDS.forEach(function (field) {
      var input = document.getElementById('fiscal-' + field);
      values[field] = input ? input.value.trim() : '';
    });
    values.taxId = values.taxId.toUpperCase();
    values.taxIdType = detectTaxIdType(values.taxId) || null;
    if (!values.country) values.country = 'ES';
    fiscalState = values;
    return values;
  }

  function installFiscalBlock() {
    var params = new URLSearchParams(window.location.search);
    var clientId = params.get('id');
    var clientForm = document.getElementById('client-form');
    if (!clientId || !clientForm || document.getElementById('client-fiscal-block')) return;

    installFetchPreserver(clientId);

    var wrapper = document.createElement('section');
    wrapper.id = 'client-fiscal-block';
    wrapper.className = 'crm-form-section';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Datos fiscales');
    wrapper.innerHTML = '' +
      '<details open>' +
        '<summary class="client-fiscal-summary">' +
          '<span>' +
            '<span class="crm-form-section__title">Datos fiscales</span>' +
            '<span class="crm-form-section__text">Razón social y dirección usada para registrar facturas.</span>' +
          '</span>' +
          '<span id="fiscal-tax-id-type" class="crm-badge crm-badge-default">Sin identificar</span>' +
        '</summary>' +
        '<div id="client-fiscal-error" class="hidden crm-alert crm-alert-danger mt-4 text-sm" role="alert"></div>' +
        '<div id="client-fiscal-success" class="hidden crm-alert crm-alert-success mt-4 text-sm" role="status"></div>' +
        '<form id="client-fiscal-form" class="mt-5 space-y-5" novalidate>' +
          '<div class="grid md:grid-cols-2 gap-4">' +
            '<div>' +
              '<label id="fiscal-tax-id-label" for="fiscal-taxId" class="block text-sm font-medium text-crm-muted mb-1">NIF/CIF/NIE</label>' +
              '<input id="fiscal-taxId" name="taxId" class="crm-input" autocomplete="off" />' +
              '<p id="fiscal-tax-id-error" class="hidden mt-2 text-sm text-crm-danger"></p>' +
            '</div>' +
            fiscalInput('legalName', 'Razón social') +
            fiscalInput('addressLine1', 'Dirección') +
            fiscalInput('city', 'Ciudad') +
            fiscalInput('postalCode', 'Código postal') +
            fiscalInput('country', 'País', 'value="ES" maxlength="2"') +
          '</div>' +
          '<details class="client-fiscal-optional">' +
            '<summary>Campos opcionales</summary>' +
            '<div class="grid md:grid-cols-2 gap-4 mt-4">' +
              fiscalInput('addressLine2', 'Dirección 2') +
              fiscalInput('region', 'Provincia / región') +
            '</div>' +
          '</details>' +
          '<div class="flex gap-3">' +
            '<button type="submit" class="crm-button crm-button-primary">Guardar datos fiscales</button>' +
          '</div>' +
        '</form>' +
      '</details>';

    var grid = clientForm.closest('.grid');
    if (grid && grid.parentElement) {
      grid.insertAdjacentElement('afterend', wrapper);
    } else {
      clientForm.insertAdjacentElement('afterend', wrapper);
    }

    api('/api/admin/clients/' + encodeURIComponent(clientId) + '/fiscal')
      .then(setFiscalValues)
      .catch(function () {});

    var taxIdInput = document.getElementById('fiscal-taxId');
    taxIdInput && taxIdInput.addEventListener('blur', function () {
      taxIdInput.value = taxIdInput.value.trim().toUpperCase();
      syncFiscalForm();
    });
    taxIdInput && taxIdInput.addEventListener('input', syncFiscalForm);

    var form = document.getElementById('client-fiscal-form');
    form && form.addEventListener('submit', function (event) {
      event.preventDefault();
      var error = document.getElementById('client-fiscal-error');
      var success = document.getElementById('client-fiscal-success');
      error && error.classList.add('hidden');
      success && success.classList.add('hidden');
      var values = readFiscalValues();
      if (!taxIdIsValid(values.taxId)) {
        syncFiscalForm();
        return;
      }
      var payload = {};
      FISCAL_FIELDS.forEach(function (field) {
        payload[field] = values[field] === '' ? null : values[field];
      });
      api('/api/admin/clients/' + encodeURIComponent(clientId) + '/fiscal', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }).then(function (data) {
        setFiscalValues(data);
        if (success) {
          success.textContent = 'Datos fiscales actualizados.';
          success.classList.remove('hidden');
        }
      }).catch(function (err) {
        if (error) {
          error.textContent = err.message || 'No se pudieron guardar los datos fiscales.';
          error.classList.remove('hidden');
        }
      });
    });
  }

  function installPaymentBadgeOnDetail() {
    var params = new URLSearchParams(window.location.search);
    var clientId = params.get('id');
    var statusWrap = document.getElementById('client-status') && document.getElementById('client-status').parentElement;
    if (!clientId || !statusWrap || document.getElementById('client-payment-status')) return;
    var badge = document.createElement('span');
    badge.id = 'client-payment-status';
    badge.className = 'crm-badge crm-badge-payment-none';
    badge.textContent = 'Sin factura';
    statusWrap.appendChild(badge);
    api('/api/admin/clients/' + encodeURIComponent(clientId) + '/payment-status')
      .then(function (data) {
        badge.className = paymentClass(data.paymentStatus);
        badge.textContent = paymentLabel(data.paymentStatus);
      })
      .catch(function () {});
  }

  function enhanceClientRows() {
    var rows = document.querySelectorAll('#clients-body tr');
    rows.forEach(function (row) {
      var link = row.querySelector('a[href*="/admin/clients/detail?id="]');
      if (!link || row.querySelector('.client-payment-row-badge')) return;
      var href = link.getAttribute('href') || '';
      var id = new URL(href, window.location.origin).searchParams.get('id');
      var firstCell = row.querySelector('td');
      if (!id || !firstCell) return;
      var badge = document.createElement('span');
      badge.className = 'client-payment-row-badge crm-badge crm-badge-payment-none mt-2';
      badge.textContent = 'Sin factura';
      firstCell.appendChild(badge);
      var cached = paymentCache.get(id);
      var apply = function (status) {
        badge.className = 'client-payment-row-badge ' + paymentClass(status) + ' mt-2';
        badge.textContent = paymentLabel(status);
      };
      if (cached) {
        apply(cached);
        return;
      }
      api('/api/admin/clients/' + encodeURIComponent(id) + '/payment-status')
        .then(function (data) {
          paymentCache.set(id, data.paymentStatus);
          apply(data.paymentStatus);
        })
        .catch(function () {});
    });
  }

  function installClientListBadges() {
    var body = document.getElementById('clients-body');
    if (!body) return;
    enhanceClientRows();
    var observer = new MutationObserver(enhanceClientRows);
    observer.observe(body, { childList: true, subtree: true });
  }

  function init() {
    if (window.location.pathname === '/admin/clients/detail') {
      installFiscalBlock();
      installPaymentBadgeOnDetail();
      setTimeout(function () {
        installFiscalBlock();
        installPaymentBadgeOnDetail();
      }, 500);
    }
    if (window.location.pathname === '/admin/clients') {
      installClientListBadges();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
