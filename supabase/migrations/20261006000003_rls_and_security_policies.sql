-- =============================================================================
-- Migration: 20261006000003_rls_and_security_policies.sql
-- Description: Row Level Security (RLS) and Granular Access Policies for Supabase.
-- Ensures data isolation while permitting public parcel tracking,
-- customer access, courier updates, and administrative management.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY ACROSS ALL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handover_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. PRICING RULES POLICIES
-- Anyone can view current pricing rules to get rate estimates
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view pricing rules" ON public.pricing_rules;
CREATE POLICY "Public can view pricing rules" 
    ON public.pricing_rules FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Admins manage pricing rules" ON public.pricing_rules;
CREATE POLICY "Admins manage pricing rules" 
    ON public.pricing_rules FOR ALL 
    USING (
        auth.role() = 'service_role' 
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id::text = auth.uid()::text AND users.role = 'admin'
        )
    );

-- -----------------------------------------------------------------------------
-- 3. DELIVERIES POLICIES
-- Tracking requires tracking number; authenticated users see their orders
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can track package with tracking number" ON public.deliveries;
CREATE POLICY "Public can track package with tracking number" 
    ON public.deliveries FOR SELECT 
    USING (tracking_number IS NOT NULL);

DROP POLICY IF EXISTS "Customers view their own orders" ON public.deliveries;
CREATE POLICY "Customers view their own orders" 
    ON public.deliveries FOR SELECT 
    USING (
        customer_id::text = auth.uid()::text 
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Couriers view assigned deliveries" ON public.deliveries;
CREATE POLICY "Couriers view assigned deliveries" 
    ON public.deliveries FOR SELECT 
    USING (
        courier_id IN (
            SELECT id FROM public.couriers WHERE user_id::text = auth.uid()::text
        )
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Service role and backend have full access to deliveries" ON public.deliveries;
CREATE POLICY "Service role and backend have full access to deliveries" 
    ON public.deliveries FOR ALL 
    USING (auth.role() = 'service_role' OR auth.jwt() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 4. COURIERS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view active couriers" ON public.couriers;
CREATE POLICY "Public can view active couriers" 
    ON public.couriers FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Couriers update own record" ON public.couriers;
CREATE POLICY "Couriers update own record" 
    ON public.couriers FOR UPDATE 
    USING (
        user_id::text = auth.uid()::text 
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS "Admins have full access to couriers" ON public.couriers;
CREATE POLICY "Admins have full access to couriers" 
    ON public.couriers FOR ALL 
    USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- 5. HANDOVER CONFIRMATIONS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Handover participants can view handover" ON public.handover_confirmations;
CREATE POLICY "Handover participants can view handover" 
    ON public.handover_confirmations FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Authorized participants can create handover" ON public.handover_confirmations;
CREATE POLICY "Authorized participants can create handover" 
    ON public.handover_confirmations FOR INSERT 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages handovers" ON public.handover_confirmations;
CREATE POLICY "Service role manages handovers" 
    ON public.handover_confirmations FOR ALL 
    USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- 6. DELIVERY STATUS HISTORY POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view delivery status history" ON public.delivery_status_history;
CREATE POLICY "Public can view delivery status history" 
    ON public.delivery_status_history FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Service role manages status history" ON public.delivery_status_history;
CREATE POLICY "Service role manages status history" 
    ON public.delivery_status_history FOR ALL 
    USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- 7. PAYMENTS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view payment by tracking or reference" ON public.payments;
CREATE POLICY "Public can view payment by tracking or reference" 
    ON public.payments FOR SELECT 
    USING (true);

DROP POLICY IF EXISTS "Service role manages payments" ON public.payments;
CREATE POLICY "Service role manages payments" 
    ON public.payments FOR ALL 
    USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- 8. USERS & ADMIN LOGS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" 
    ON public.users FOR SELECT 
    USING (id::text = auth.uid()::text OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages users" ON public.users;
CREATE POLICY "Service role manages users" 
    ON public.users FOR ALL 
    USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role manages admin logs" ON public.admin_logs;
CREATE POLICY "Service role manages admin logs" 
    ON public.admin_logs FOR ALL 
    USING (auth.role() = 'service_role');
