# Kola Express — Delivery Service Web Application

> **“Send it. We deliver it.”**  
> Fast, simple and reliable 100% cashless delivery service across Kampala, Uganda.

---

## 🌟 Overview & Core Concept

**Kola Express** is a digital delivery-request service operating in Kampala, Uganda. The platform allows anyone to request express transportation of parcels, packages, documents, groceries, or permitted items from one location to another.

- **No merchant or business registration required**: Any individual can request a delivery immediately.
- **100% Cashless**: Fully cashless operations via **MTN Mobile Money** and **Airtel Money** with server-side validation.
- **Mobile-first, modern logistics UI**: Custom design with Google Fonts (`Outfit` & `Plus Jakarta Sans`), dark glassmorphic styling, responsive layout, micro-animations, and live quote calculation.
- **Full Operational Separation**:
  - 🚀 **Customer App**: Homepage, live pricing quote, delivery request form, cashless USSD checkout, and account history.
  - 🔍 **Live Tracking**: Step-by-step 10-status timeline, courier info, pickup & drop directions, and audit history.
  - 🛵 **Courier Portal**: Private internal operations tool for riders to view assigned tasks, call sender/recipient with 1 click, and advance delivery progress.
  - 🛡️ **Admin Operations Dashboard**: Central dispatch, courier assignment, live cashless payments ledger, configurable pricing rules engine, and analytics.

---

## 🚀 Quick Start

### 1. Start the Server
```bash
npm start
```
The server runs at: **http://localhost:3000**

### 2. Ready-to-Use Demo Accounts & Credentials

| Role | Username / Identifier | Password | Access Location |
|---|---|---|---|
| **Administrator** | `admin@kolaexpress.ug` or `0700000000` | `admin123` | **Direct URL only**: `http://localhost:3000/admin` (Hidden from public site) |
| **Courier (Musa)** | `0772100201` | `courier123` | Public App Courier Tab or `http://localhost:3000#courier` |
| **Courier (Denis)** | `0701445678` | `courier123` | Boda Boda (TVS HLX) • Plate: `UFE 912K` |
| **Courier (Brian)** | `0782555901` | `courier123` | Boda Boda (Yamaha Crux) • Plate: `UFB 334M` |
| **Customer (Sarah)** | `0775123456` | `customer123` | Seeded customer account with past deliveries |

> **Security Note**: For operational security, the Admin Dashboard has been completely decoupled and hidden from the public customer interface, top bar, navigation, and footer. Administrators access the system via the dedicated private route **`http://localhost:3000/admin`**.

---

## 🛠️ Architecture & Technology Stack

- **Frontend**: Lightweight Vanilla HTML5, CSS3 design system, and ES6+ JavaScript. Fast, zero-build step, zero bundle bloat, responsive across phones, tablets, and desktops.
- **Backend**: Node.js & Express REST API with security middleware and JWT token verification.
- **Database**: SQLite (`better-sqlite3`) relational database with ACID transactions, foreign keys, and automatic seeding.
- **Pricing Engine**: Dynamic rule-based pricing supporting Kampala & Wakiso District road network distance calculation, base fees, zero package size surcharges, and priority dispatch (with confidential backend-managed per-km rates).
- **Cashless Engine**: Server-side simulated STK Push and callback verification for **MTN Mobile Money** and **Airtel Money** (Uganda standard formats `077/078/076` and `070/075/074`).

---

## 📋 Database Schema

```sql
users (id, full_name, phone, email, password_hash, role, created_at)
couriers (id, user_id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips, created_at)
pricing_rules (id, base_fee, per_km_rate, min_fee, urgent_surcharge, category_surcharges, updated_at)
deliveries (id, tracking_number, customer_id, sender_name, sender_phone, pickup_location, pickup_directions, pickup_notes, recipient_name, recipient_phone, delivery_location, delivery_directions, delivery_notes, item_description, item_category, special_instructions, is_urgent, distance_km, delivery_fee, status, courier_id, courier_assigned_at, picked_up_at, delivered_at, created_at)
delivery_status_history (id, delivery_id, status, note, updated_by, timestamp)
payments (id, delivery_id, tracking_number, amount, currency, payment_method, customer_phone, reference_id, payment_status, provider_response, created_at, confirmed_at)
admin_logs (id, admin_name, action, details, timestamp)
```

---

## 📦 10-Stage Delivery Status Lifecycle

1. `Request Created`
2. `Awaiting Payment`
3. `Payment Confirmed`
4. `Courier Assigned`
5. `Courier En Route to Pickup`
6. `Item Picked Up`
7. `In Transit`
8. `Near Destination`
9. `Delivered`
10. `Cancelled`

---

## 🔒 Security Principles

- No secret API keys exposed in frontend code.
- Strict server-side verification for payments; frontend cannot set a payment as confirmed.
- Input validation on Uganda phone numbers and mandatory fields.
- Role-based authorization for administrative and courier dispatch actions.
- Full immutable status audit history for every delivery request.

---

## 🗄️ Supabase Database Migration Workflow

Kola Express features an enterprise-grade, version-controlled **Supabase Database Migration Workflow**. Database schemas are managed using declarative, idempotent SQL migration files under `supabase/migrations/`.

### Migration Structure
```
supabase/
├── config.toml                              # Supabase project configuration
├── seed.sql                                 # Idempotent baseline seed data
├── data_export_from_sqlite.sql              # Clean SQL export of live SQLite records
└── migrations/
    ├── 20261006000001_initial_schema.sql            # Core tables, constraints & indexes
    ├── 20261006000002_delivery_pricing_engine.sql   # 17 delivery-pricing fields & sync triggers
    └── 20261006000003_rls_and_security_policies.sql # Row Level Security policies
```

### 17 Authoritative Delivery-Pricing Engine Fields
Every delivery record contains authoritative routing and pricing calculations:
- `pickup_address`, `pickup_latitude`, `pickup_longitude`
- `dropoff_address`, `dropoff_latitude`, `dropoff_longitude`
- `road_distance` (km), `estimated_travel_time` (mins)
- `base_delivery_fee`, `distance_fee`, `surcharges`, `discounts`, `final_delivery_fee`
- `pricing_version`, `routing_provider`, `route_reference`, `pricing_calculation_timestamp`

### Commands Cheat-Sheet

| Action | Command | Description |
|---|---|---|
| **Validate Migrations** | `npm run db:validate` (or `npm test`) | Validates syntax, non-destructive safety, pricing fields, and leaks |
| **Export SQLite Data** | `npm run db:export` | Exports all live SQLite records into `supabase/data_export_from_sqlite.sql` |
| **Sync to Supabase** | `npm run db:sync` | Directly syncs SQLite records to Supabase PostgreSQL via `DATABASE_URL` |
| **Link Remote Supabase** | `npx supabase link --project-ref <your-ref>` | Links local CLI to remote Supabase project |
| **Create New Migration** | `npx supabase migration new <name>` | Generates a new timestamped migration file |
| **Deploy Migrations (Push)** | `npx supabase db push` | Applies pending migrations to remote Supabase database |
| **Check Migration Status** | `npx supabase migration list` | Compares local migration files with remote database state |
