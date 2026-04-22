// Shared CRM UI utilities — extracted from 32-page monolith
// Prevents duplication across all portal pages

// ── Sidebar Toggle ──

export function initSidebar(sidebarId = 'main-sidebar', overlayId = 'sidebar-overlay', toggleId = 'sidebar-toggle') {
    const sidebar = document.getElementById(sidebarId);
    const overlay = document.getElementById(overlayId);
    const toggle = document.getElementById(toggleId);

    if (!sidebar || !overlay || !toggle) return;

    const open = () => {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const close = () => {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
        document.body.style.overflow = '';
    };

    toggle.addEventListener('click', open);
    overlay.addEventListener('click', close);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar && !sidebar.classList.contains('-translate-x-full')) {
            close();
        }
    });

    return { open, close, toggle: toggle as HTMLButtonElement, sidebar, overlay };
}

// ── Text Setter ──

export function setText(id: string | null, value: string) {
    const el = document.getElementById(id ?? '');
    if (el) el.textContent = value;
}

// ── Metric Setter ──

export function setMetric(id: string | null, value: string) {
    setText(id, value);
}

// ── Debounce ──

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ── Is Due Soon ──

export function isDueSoon(dateString: string | null | undefined, days = 7): boolean {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

// ── Is Review Soon ──

export function isReviewSoon(dateString: string | null | undefined): boolean {
    return isDueSoon(dateString, 14);
}

// ── Escape HTML (re-export from api-client) ──

// Use the existing escapeHtml from api-client, don't duplicate

// ── Modal Helpers ──

export function openModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

export function closeModal(modalId: string) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
}

export function initModal(modalId: string, closeTriggerIds: string[]) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    closeTriggerIds.forEach((id) => {
        const trigger = document.getElementById(id);
        trigger?.addEventListener('click', () => closeModal(modalId));
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modalId);
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal(modalId);
        }
    });
}

// ── Notification Polling ──

export function startPolling(callback: () => void, intervalMs: number = 60000): () => void {
    callback();
    const id = setInterval(callback, intervalMs);
    return () => clearInterval(id);
}

// ── Search Filter ──

export function filterRows(query: string, rows: Record<string, string | number | boolean>[]): Record<string, string | number | boolean>[] {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((row) =>
        Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
}

// ── Render Empty State ──

export function renderEmpty(tableBodyId: string, colspan: number, message: string) {
    const tbody = document.getElementById(tableBodyId);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="px-6 py-8 text-center text-crm-muted">${message}</td></tr>`;
    }
}

// ── Render Error State ──

export function renderError(tableBodyId: string, colspan: number, message: string) {
    const tbody = document.getElementById(tableBodyId);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="px-6 py-8 text-center text-crm-danger">${message}</td></tr>`;
    }
}

// ── SR-only utility (for dynamic content) ──

export function announceToSR(elementId: string, message: string) {
    let el = document.getElementById(elementId);
    if (!el) {
        el = document.createElement('div');
        el.id = elementId;
        el.setAttribute('aria-live', 'polite');
        el.setAttribute('aria-atomic', 'true');
        el.className = 'sr-only';
        document.body.appendChild(el);
    }
    el.textContent = message;
}
