/**
 * Kola Express Supabase Connection & Client Helper
 * Provides unified access to Supabase Client (@supabase/supabase-js)
 * and PostgreSQL Connection Pool (pg) for migrations and queries.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

let supabaseClient = null;
let supabaseAdminClient = null;
let pgPool = null;

/**
 * Check whether Supabase environment variables are configured
 */
function isSupabaseConfigured() {
  return Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceRoleKey));
}

/**
 * Check whether direct PostgreSQL connection string is configured
 */
function isPostgresConfigured() {
  return Boolean(databaseUrl);
}

/**
 * Get public Supabase client (respects Row Level Security)
 */
function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClient) {
    const key = supabaseAnonKey || supabaseServiceRoleKey;
    supabaseClient = createClient(supabaseUrl, key, {
      auth: { persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Get admin Supabase client with Service Role privileges
 */
function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseAdminClient;
}

/**
 * Get direct PostgreSQL connection pool for migrations or raw queries
 */
function getPgPool() {
  if (!isPostgresConfigured()) {
    return null;
  }
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

/**
 * Test Supabase and database connection health
 */
async function testConnection() {
  const result = {
    supabase_configured: isSupabaseConfigured(),
    postgres_configured: isPostgresConfigured(),
    supabase_client: false,
    postgres_connected: false,
    message: ''
  };

  if (!result.supabase_configured && !result.postgres_configured) {
    result.message = 'Supabase credentials not configured in .env. Application running in local SQLite mode.';
    return result;
  }

  if (result.postgres_configured) {
    try {
      const pool = getPgPool();
      const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name;');
      result.postgres_connected = true;
      result.message = `Successfully connected to PostgreSQL database: ${res.rows[0].db_name}`;
    } catch (err) {
      result.message = `PostgreSQL connection error: ${err.message}`;
    }
  }

  return result;
}

module.exports = {
  isSupabaseConfigured,
  isPostgresConfigured,
  getSupabaseClient,
  getSupabaseAdmin,
  getPgPool,
  testConnection
};
