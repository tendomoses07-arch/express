-- =============================================================================
-- Migration: 20261006000002_delivery_pricing_engine.sql
-- Description: Authoritative Delivery Pricing & Road Routing Specification.
-- Adds 17 dedicated fields for exact road calculation, coordinates, fees,
-- routing engine provenance, and pricing version audit.
-- Safe, non-destructive, and backward-compatible with automatic sync triggers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADD NEW DELIVERY PRICING & ROUTING COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE public.deliveries 
    ADD COLUMN IF NOT EXISTS pickup_address TEXT,
    ADD COLUMN IF NOT EXISTS pickup_latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS pickup_longitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS dropoff_address TEXT,
    ADD COLUMN IF NOT EXISTS dropoff_latitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS dropoff_longitude NUMERIC(10, 7),
    ADD COLUMN IF NOT EXISTS road_distance NUMERIC(10, 2),
    ADD COLUMN IF NOT EXISTS estimated_travel_time INTEGER,
    ADD COLUMN IF NOT EXISTS base_delivery_fee NUMERIC(12, 2) DEFAULT 4000,
    ADD COLUMN IF NOT EXISTS distance_fee NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS surcharges NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discounts NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS final_delivery_fee NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS pricing_version VARCHAR(50) DEFAULT 'v1.0',
    ADD COLUMN IF NOT EXISTS routing_provider VARCHAR(50) DEFAULT 'osrm',
    ADD COLUMN IF NOT EXISTS route_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS pricing_calculation_timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- -----------------------------------------------------------------------------
-- 2. BACKFILL EXISTING RECORDS SAFELY
-- Ensures historical deliveries immediately populate the new pricing schema
-- -----------------------------------------------------------------------------
UPDATE public.deliveries
SET 
    pickup_address = COALESCE(pickup_address, pickup_location),
    pickup_latitude = COALESCE(pickup_latitude, pickup_lat),
    pickup_longitude = COALESCE(pickup_longitude, pickup_lng),
    dropoff_address = COALESCE(dropoff_address, delivery_location),
    dropoff_latitude = COALESCE(dropoff_latitude, delivery_lat),
    dropoff_longitude = COALESCE(dropoff_longitude, delivery_lng),
    road_distance = COALESCE(road_distance, distance_km),
    estimated_travel_time = COALESCE(estimated_travel_time, eta_minutes),
    final_delivery_fee = COALESCE(final_delivery_fee, delivery_fee),
    base_delivery_fee = COALESCE(base_delivery_fee, 4000),
    distance_fee = COALESCE(distance_fee, GREATEST(0, delivery_fee - 4000)),
    surcharges = COALESCE(surcharges, CASE WHEN is_urgent = 1 THEN 3000 ELSE 0 END),
    discounts = COALESCE(discounts, 0),
    pricing_version = COALESCE(pricing_version, 'v1.0'),
    routing_provider = COALESCE(routing_provider, 'osrm'),
    pricing_calculation_timestamp = COALESCE(pricing_calculation_timestamp, created_at)
WHERE 
    pickup_address IS NULL 
    OR dropoff_address IS NULL 
    OR final_delivery_fee IS NULL;

-- -----------------------------------------------------------------------------
-- 3. BIDIRECTIONAL SYNC TRIGGER FOR SEAMLESS BACKWARD & FORWARD COMPATIBILITY
-- Automatically synchronizes legacy and modern pricing fields on insert/update
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_delivery_pricing_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync Pickup
    IF NEW.pickup_address IS NULL AND NEW.pickup_location IS NOT NULL THEN
        NEW.pickup_address := NEW.pickup_location;
    ELSIF NEW.pickup_location IS NULL AND NEW.pickup_address IS NOT NULL THEN
        NEW.pickup_location := NEW.pickup_address;
    END IF;

    IF NEW.pickup_latitude IS NULL AND NEW.pickup_lat IS NOT NULL THEN
        NEW.pickup_latitude := NEW.pickup_lat;
    ELSIF NEW.pickup_lat IS NULL AND NEW.pickup_latitude IS NOT NULL THEN
        NEW.pickup_lat := NEW.pickup_latitude;
    END IF;

    IF NEW.pickup_longitude IS NULL AND NEW.pickup_lng IS NOT NULL THEN
        NEW.pickup_longitude := NEW.pickup_lng;
    ELSIF NEW.pickup_lng IS NULL AND NEW.pickup_longitude IS NOT NULL THEN
        NEW.pickup_lng := NEW.pickup_longitude;
    END IF;

    -- Sync Dropoff
    IF NEW.dropoff_address IS NULL AND NEW.delivery_location IS NOT NULL THEN
        NEW.dropoff_address := NEW.delivery_location;
    ELSIF NEW.delivery_location IS NULL AND NEW.dropoff_address IS NOT NULL THEN
        NEW.delivery_location := NEW.dropoff_address;
    END IF;

    IF NEW.dropoff_latitude IS NULL AND NEW.delivery_lat IS NOT NULL THEN
        NEW.dropoff_latitude := NEW.delivery_lat;
    ELSIF NEW.delivery_lat IS NULL AND NEW.dropoff_latitude IS NOT NULL THEN
        NEW.delivery_lat := NEW.dropoff_latitude;
    END IF;

    IF NEW.dropoff_longitude IS NULL AND NEW.delivery_lng IS NOT NULL THEN
        NEW.dropoff_longitude := NEW.delivery_lng;
    ELSIF NEW.delivery_lng IS NULL AND NEW.dropoff_longitude IS NOT NULL THEN
        NEW.delivery_lng := NEW.dropoff_longitude;
    END IF;

    -- Sync Road Distance & Travel Time
    IF NEW.road_distance IS NULL AND NEW.distance_km IS NOT NULL THEN
        NEW.road_distance := NEW.distance_km;
    ELSIF NEW.distance_km IS NULL AND NEW.road_distance IS NOT NULL THEN
        NEW.distance_km := NEW.road_distance;
    END IF;

    IF NEW.estimated_travel_time IS NULL AND NEW.eta_minutes IS NOT NULL THEN
        NEW.estimated_travel_time := NEW.eta_minutes;
    ELSIF NEW.eta_minutes IS NULL AND NEW.estimated_travel_time IS NOT NULL THEN
        NEW.eta_minutes := NEW.estimated_travel_time;
    END IF;

    -- Sync Delivery Fees
    IF NEW.final_delivery_fee IS NULL AND NEW.delivery_fee IS NOT NULL THEN
        NEW.final_delivery_fee := NEW.delivery_fee;
    ELSIF NEW.delivery_fee IS NULL AND NEW.final_delivery_fee IS NOT NULL THEN
        NEW.delivery_fee := ROUND(NEW.final_delivery_fee)::BIGINT;
    END IF;

    -- Default pricing metadata if missing
    IF NEW.pricing_version IS NULL THEN
        NEW.pricing_version := 'v1.0';
    END IF;
    IF NEW.routing_provider IS NULL THEN
        NEW.routing_provider := 'osrm';
    END IF;
    IF NEW.pricing_calculation_timestamp IS NULL THEN
        NEW.pricing_calculation_timestamp := timezone('utc'::text, now());
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_delivery_pricing_fields ON public.deliveries;
CREATE TRIGGER trg_sync_delivery_pricing_fields
    BEFORE INSERT OR UPDATE ON public.deliveries
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sync_delivery_pricing_fields();

-- -----------------------------------------------------------------------------
-- 4. PERFORMANCE & AUDIT INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_deliveries_pricing_calc 
    ON public.deliveries(pricing_calculation_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_deliveries_routing_provider 
    ON public.deliveries(routing_provider);

CREATE INDEX IF NOT EXISTS idx_deliveries_pricing_version 
    ON public.deliveries(pricing_version);
