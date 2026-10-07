-- =============================================================================
-- Migration: 20261006000001_initial_schema.sql
-- Description: Baseline schema for Kola Express delivery management platform.
-- Safe, non-destructive, idempotent DDL preserving existing Kola Express structure.
-- =============================================================================

-- Ensure UUID and pgcrypto extensions are available if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. USERS TABLE
-- Stores customers, couriers, and administrators
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'courier', 'admin')),
    admin_role TEXT DEFAULT 'super_admin' CHECK (admin_role IN ('super_admin', 'operations_admin', 'finance_admin')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- 2. COURIERS TABLE
-- Stores active delivery riders / drivers and vehicle info
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.couriers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    vehicle_type TEXT DEFAULT 'Boda Boda (Motorcycle)',
    plate_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'busy', 'offline')),
    rating NUMERIC(3, 2) DEFAULT 4.90,
    total_trips INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- 3. PRICING RULES TABLE
-- Baseline pricing configuration for Kola Express delivery engine
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id BIGSERIAL PRIMARY KEY,
    base_fee BIGINT NOT NULL DEFAULT 4000,
    per_km_rate BIGINT NOT NULL DEFAULT 800,
    min_fee BIGINT NOT NULL DEFAULT 3500,
    urgent_surcharge BIGINT NOT NULL DEFAULT 3000,
    category_surcharges JSONB NOT NULL DEFAULT '{"document":0,"small_parcel":0,"medium_box":0,"large_package":0,"groceries":0,"fragile":0}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- 4. DELIVERIES TABLE
-- Core delivery tracking & dispatch records
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deliveries (
    id BIGSERIAL PRIMARY KEY,
    tracking_number TEXT UNIQUE NOT NULL,
    customer_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    pickup_location TEXT NOT NULL,
    pickup_directions TEXT,
    pickup_notes TEXT,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    delivery_location TEXT NOT NULL,
    delivery_directions TEXT,
    delivery_notes TEXT,
    item_description TEXT NOT NULL,
    item_category TEXT NOT NULL DEFAULT 'small_parcel',
    special_instructions TEXT,
    is_urgent INTEGER DEFAULT 0,
    distance_km NUMERIC(8, 2) NOT NULL DEFAULT 5.00,
    delivery_fee BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Awaiting Payment',
    courier_id BIGINT REFERENCES public.couriers(id) ON DELETE SET NULL,
    courier_assigned_at TIMESTAMPTZ,
    courier_arrived_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    handover_confirmed_at TIMESTAMPTZ,
    handover_confirmation_id TEXT,
    handover_sender_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    handover_status TEXT,
    handover_notes TEXT,
    courier_confirmed_at TIMESTAMPTZ,
    courier_confirmed_received INTEGER DEFAULT 0,
    delivery_pin TEXT,
    pin_verified_at TIMESTAMPTZ,
    delivery_confirmed_by_pin INTEGER DEFAULT 0,
    pickup_lat NUMERIC(10, 7),
    pickup_lng NUMERIC(10, 7),
    delivery_lat NUMERIC(10, 7),
    delivery_lng NUMERIC(10, 7),
    eta_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- 5. HANDOVER CONFIRMATIONS TABLE
-- Digital receipt and package verification handoff
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handover_confirmations (
    id BIGSERIAL PRIMARY KEY,
    handover_id TEXT UNIQUE NOT NULL,
    delivery_id BIGINT NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    tracking_number TEXT NOT NULL,
    sender_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    sender_name TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    courier_id BIGINT REFERENCES public.couriers(id) ON DELETE SET NULL,
    courier_name TEXT NOT NULL,
    courier_phone TEXT NOT NULL,
    courier_arrived_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    previous_status TEXT NOT NULL DEFAULT 'Awaiting Sender Confirmation',
    new_status TEXT NOT NULL DEFAULT 'Package Picked Up',
    confirmation_type TEXT NOT NULL DEFAULT 'sender_digital_handover',
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- 6. DELIVERY STATUS HISTORY TABLE
-- Audit trail of transitions for real-time tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_status_history (
    id BIGSERIAL PRIMARY KEY,
    delivery_id BIGINT NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT,
    updated_by TEXT DEFAULT 'System',
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Ensure nullable for historical SQLite compatibility if table already created
ALTER TABLE IF EXISTS public.delivery_status_history ALTER COLUMN timestamp DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 7. PAYMENTS TABLE
-- Mobile money (MTN / Airtel) cashless payment transactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    delivery_id BIGINT NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    tracking_number TEXT NOT NULL,
    amount BIGINT NOT NULL,
    currency TEXT DEFAULT 'UGX',
    payment_method TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    reference_id TEXT UNIQUE NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Successful', 'Failed')),
    provider_response TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    confirmed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.payments ALTER COLUMN created_at DROP NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. ADMIN LOGS TABLE
-- Security audit trail for admin actions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    admin_name TEXT NOT NULL,
    admin_role TEXT DEFAULT 'super_admin',
    action TEXT NOT NULL,
    resource TEXT,
    resource_id TEXT,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -----------------------------------------------------------------------------
-- INDEXES FOR PERFORMANCE AND RELIABILITY
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

CREATE INDEX IF NOT EXISTS idx_couriers_user_id ON public.couriers(user_id);
CREATE INDEX IF NOT EXISTS idx_couriers_status ON public.couriers(status);

CREATE INDEX IF NOT EXISTS idx_deliveries_tracking_number ON public.deliveries(tracking_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_customer_id ON public.deliveries(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier_id ON public.deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON public.deliveries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_handover_delivery_id ON public.handover_confirmations(delivery_id);
CREATE INDEX IF NOT EXISTS idx_handover_tracking ON public.handover_confirmations(tracking_number);

CREATE INDEX IF NOT EXISTS idx_status_history_delivery_id ON public.delivery_status_history(delivery_id);
CREATE INDEX IF NOT EXISTS idx_payments_delivery_id ON public.payments(delivery_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference_id ON public.payments(reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_tracking ON public.payments(tracking_number);

CREATE INDEX IF NOT EXISTS idx_admin_logs_timestamp ON public.admin_logs(timestamp DESC);
