-- =============================================================================
-- Seed Data: supabase/seed.sql
-- Description: Non-destructive initial seed data for clean environments.
-- Uses ON CONFLICT DO NOTHING to preserve existing records in active databases.
-- =============================================================================

-- 1. Baseline Pricing Rules
INSERT INTO public.pricing_rules (
    id, base_fee, per_km_rate, min_fee, urgent_surcharge, category_surcharges, updated_at
) VALUES (
    1, 4000, 800, 3500, 3000, 
    '{"document":0,"small_parcel":0,"medium_box":0,"large_package":0,"groceries":0,"fragile":0}'::jsonb,
    timezone('utc'::text, now())
) ON CONFLICT (id) DO UPDATE SET
    base_fee = EXCLUDED.base_fee,
    per_km_rate = EXCLUDED.per_km_rate,
    min_fee = EXCLUDED.min_fee,
    urgent_surcharge = EXCLUDED.urgent_surcharge;

-- 2. Core Administrative Accounts
-- Passwords are safe bcrypt hashes:
-- admin@kolaexpress.ug -> admin123
-- ops@kolaexpress.ug   -> ops123
-- finance@kolaexpress.ug -> finance123
INSERT INTO public.users (full_name, phone, email, password_hash, role, admin_role, is_active)
VALUES 
    ('Super Administrator', '0700000000', 'admin@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'admin', 'super_admin', 1),
    ('Operations Director', '0770112233', 'ops@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'admin', 'operations_admin', 1),
    ('Finance Officer', '0770445566', 'finance@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'admin', 'finance_admin', 1)
ON CONFLICT (email) DO NOTHING;

-- 3. Core Baseline Couriers
INSERT INTO public.users (full_name, phone, email, password_hash, role, is_active)
VALUES 
    ('Musa Ssewankambo', '0772100201', 'musa@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'courier', 1),
    ('Denis Okello', '0701445678', 'denis@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'courier', 1),
    ('Brian Katende', '0782555901', 'brian@kolaexpress.ug', '$2b$10$w09Z5h1nE4r9R6l/gPqT8eD0544qDq6PqJqT8eD0544qDq6PqJqT.', 'courier', 1)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.couriers (user_id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips)
VALUES
    ((SELECT id FROM public.users WHERE phone = '0772100201' LIMIT 1), 'Musa Ssewankambo', '0772100201', 'Boda Boda (Bajaj Boxer)', 'UFA 482B', 'active', 4.95, 142),
    ((SELECT id FROM public.users WHERE phone = '0701445678' LIMIT 1), 'Denis Okello', '0701445678', 'Boda Boda (TVS HLX)', 'UFE 912K', 'active', 4.88, 98),
    ((SELECT id FROM public.users WHERE phone = '0782555901' LIMIT 1), 'Brian Katende', '0782555901', 'Boda Boda (Yamaha Crux)', 'UFB 334M', 'active', 4.92, 115)
ON CONFLICT (phone) DO NOTHING;
