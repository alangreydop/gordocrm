-- Migración 0004: Sistema de Facturación
-- Añade campos fiscales a clients y crea tablas invoices + invoice_items
-- Cumplimiento legal España (BOE)

-- ============================================
-- 1. Campos fiscales en clients (B2B only)
-- ============================================

ALTER TABLE clients ADD COLUMN taxId text; -- CIF/NIF (ej: B12345678)
ALTER TABLE clients ADD COLUMN taxIdType text DEFAULT 'NIF'; -- NIF, CIF, NIE, VIES
ALTER TABLE clients ADD COLUMN legalName text; -- Razón social completa
ALTER TABLE clients ADD COLUMN addressLine1 text; -- Calle y número
ALTER TABLE clients ADD COLUMN addressLine2 text; -- Piso, puerta, etc.
ALTER TABLE clients ADD COLUMN city text; -- Ciudad
ALTER TABLE clients ADD COLUMN region text; -- Provincia/Comunidad Autónoma
ALTER TABLE clients ADD COLUMN postalCode text; -- Código postal
ALTER TABLE clients ADD COLUMN country text DEFAULT 'ES'; -- País (ISO 3166-1)
ALTER TABLE clients ADD COLUMN phone text; -- Teléfono de contacto
ALTER TABLE clients ADD COLUMN registrationNumber text; -- Número de registro mercantil (opcional)

-- Índices para búsqueda
CREATE INDEX IF NOT EXISTS idx_clients_tax_id ON clients(taxId);
CREATE INDEX IF NOT EXISTS idx_clients_country ON clients(country);

-- ============================================
-- 2. Tabla invoices (cabecera de factura)
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  invoiceNumber text NOT NULL UNIQUE, -- F2026-001, F2026-002, etc.
  series text NOT NULL DEFAULT 'F', -- Serie de facturación
  fiscalYear integer NOT NULL, -- Año fiscal (2026)

  -- Cliente
  clientId text NOT NULL REFERENCES clients(id),
  clientTaxId text NOT NULL, -- CIF/NIF en momento de emisión
  clientLegalName text NOT NULL, -- Razón social en momento de emisión
  clientAddressLine1 text NOT NULL,
  clientAddressLine2 text,
  clientCity text NOT NULL,
  clientRegion text,
  clientPostalCode text NOT NULL,
  clientCountry text DEFAULT 'ES',
  clientEmail text NOT NULL, -- Para envío de factura

  -- Emisor (Grande & Gordo)
  issuerTaxId text NOT NULL, -- Nuestro CIF/NIF
  issuerLegalName text NOT NULL,
  issuerAddressLine1 text NOT NULL,
  issuerCity text NOT NULL,
  issuerPostalCode text NOT NULL,
  issuerCountry text DEFAULT 'ES',
  issuerEmail text NOT NULL,

  -- Fechas
  issueDate integer NOT NULL, -- timestamp_ms - Fecha de emisión
  dueDate integer NOT NULL, -- timestamp_ms - Fecha de vencimiento
  paidAt integer, -- timestamp_ms - Fecha de pago (null = pendiente)

  -- Conceptos
  description text, -- Descripción general de la factura

  -- Importes (en céntimos para evitar problemas de float)
  subtotalCents integer NOT NULL DEFAULT 0, -- Base imponible
  taxRate real NOT NULL DEFAULT 0.21, -- IVA (21% estándar)
  taxAmountCents integer NOT NULL DEFAULT 0, -- Cuota de IVA
  irpfRate real DEFAULT 0, -- IRPF (opcional, ej: 0.15)
  irpfAmountCents integer DEFAULT 0, -- Retención IRPF
  totalCents integer NOT NULL DEFAULT 0, -- Total a pagar

  -- Estado
  status text NOT NULL DEFAULT 'draft', -- draft, issued, sent, paid, cancelled, overdue
  paymentMethod text, -- transferencia, tarjeta, efectivo, etc.
  paymentNotes text, -- Notas sobre el pago (ej: número de cuenta)

  -- Factura rectificativa
  isRectificative integer DEFAULT 0, -- 1 = rectificativa, 0 = normal
  rectificativeReason text, -- Motivo de la rectificación
  originalInvoiceId text REFERENCES invoices(id), -- ID de factura original (si es rectificativa)

  -- Jobs relacionados
  relatedJobIds text, -- JSON array de job IDs relacionados

  -- Metadata
  notes text, -- Notas internas
  terms text, -- Términos y condiciones
  footer text, -- Texto legal del pie de factura

  -- Control
  createdAt integer NOT NULL,
  updatedAt integer NOT NULL,

  -- Validaciones
  CHECK (subtotalCents >= 0),
  CHECK (taxAmountCents >= 0),
  CHECK (totalCents >= 0),
  CHECK (taxRate >= 0 AND taxRate <= 1),
  CHECK (irpfRate IS NULL OR (irpfRate >= 0 AND irpfRate <= 1)),
  CHECK (status IN ('draft', 'issued', 'sent', 'paid', 'cancelled', 'overdue'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(clientId);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoiceNumber);
CREATE INDEX IF NOT EXISTS idx_invoices_fiscal_year ON invoices(fiscalYear);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issueDate);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(dueDate);

-- ============================================
-- 3. Tabla invoice_items (líneas de factura)
-- ============================================

CREATE TABLE IF NOT EXISTS invoice_items (
  id text PRIMARY KEY,
  invoiceId text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Concepto
  description text NOT NULL, -- Descripción del concepto
  quantity real NOT NULL DEFAULT 1, -- Cantidad
  unitPriceCents integer NOT NULL, -- Precio unitario (céntimos)

  -- Importes
  subtotalCents integer NOT NULL, -- quantity * unitPrice
  taxRate real NOT NULL DEFAULT 0.21, -- IVA aplicable a esta línea
  taxAmountCents integer NOT NULL, -- Cuota de IVA
  irpfRate real DEFAULT 0, -- IRPF si aplica
  irpfAmountCents integer DEFAULT 0, -- Retención IRPF
  totalCents integer NOT NULL, -- Total línea

  -- Orden
  sortOrder integer NOT NULL DEFAULT 0,

  -- Metadata
  jobId text REFERENCES jobs(id), -- Job relacionado (opcional)
  metadata text, -- JSON con metadata adicional

  createdAt integer NOT NULL,

  -- Validaciones
  CHECK (quantity > 0),
  CHECK (unitPriceCents >= 0),
  CHECK (subtotalCents >= 0),
  CHECK (taxAmountCents >= 0),
  CHECK (totalCents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoiceId);
CREATE INDEX IF NOT EXISTS idx_invoice_items_job_id ON invoice_items(jobId);

-- ============================================
-- 4. Tabla invoice_logs (auditoría)
-- ============================================

CREATE TABLE IF NOT EXISTS invoice_logs (
  id text PRIMARY KEY,
  invoiceId text NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  action text NOT NULL, -- created, issued, sent, paid, cancelled, modified, emailed
  userId text, -- Usuario que realizó la acción
  details text, -- JSON con detalles del cambio

  createdAt integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_logs_invoice_id ON invoice_logs(invoiceId);
CREATE INDEX IF NOT EXISTS idx_invoice_logs_created_at ON invoice_logs(createdAt);

-- ============================================
-- 5. Tabla config (configuración del sistema)
-- ============================================

CREATE TABLE IF NOT EXISTS config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updatedAt integer DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================
-- 6. Datos de la empresa emisora (Grande & Gordo)
-- ============================================

-- Insertar configuración por defecto del emisor
-- NOTA: Estos datos deben actualizarse con los datos reales de la empresa
INSERT OR REPLACE INTO config (key, value) VALUES
  ('issuer_tax_id', 'B00000000'), -- CIF de Grande & Gordo (actualizar)
  ('issuer_legal_name', 'Grande & Gordo S.L.'), -- Razón social completa
  ('issuer_address_line1', 'Calle Ejemplo, 123'), -- Dirección fiscal
  ('issuer_city', 'A Coruña'), -- Ciudad
  ('issuer_postal_code', '15001'), -- CP
  ('issuer_country', 'ES'),
  ('issuer_email', 'facturacion@grandeandgordo.com'), -- Email de facturación
  ('issuer_phone', '+34 000 000 000'), -- Teléfono
  ('issuer_registration_number', 'RM A Coruña, Tomo 0000, Folio 000, Hoja C-00000'), -- Registro Mercantil
  ('invoice_footer', 'Grande & Gordo S.L. - Todos los derechos reservados.'),
  ('default_payment_method', 'transferencia'),
  ('default_payment_notes', 'Transferencia bancaria a ES00 0000 0000 0000 0000 0000 - Banco XXX')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

-- ============================================
-- 6. Trigger: Validar datos fiscales antes de crear factura
-- ============================================

-- Nota: SQLite no tiene triggers complejos de validación cross-table
-- La validación se hará en la capa de aplicación
