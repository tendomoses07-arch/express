/**
 * Kola Express SQLite -> Supabase PostgreSQL Data Sync Utility
 * Non-destructive, idempotent migration of live SQLite records to Supabase.
 *
 * Usage:
 *   node server/scripts/sync-sqlite-to-supabase.js [--export-only]
 *
 * Options:
 *   --export-only : Exports all SQLite records into supabase/data_export_from_sqlite.sql
 *                   without connecting to a live PostgreSQL database.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { db } = require('../db');

const EXPORT_FILE = path.join(__dirname, '..', '..', 'supabase', 'data_export_from_sqlite.sql');

function sanitizeDbUrl(url) {
  if (!url) return url;
  const protocolMatch = url.match(/^([^:]+:\/\/)(.*)$/);
  if (!protocolMatch) return url;
  const rest = protocolMatch[2];
  const lastAt = rest.lastIndexOf('@');
  if (lastAt === -1) return url;
  const userinfo = rest.substring(0, lastAt);
  const hostportdb = rest.substring(lastAt + 1);
  const colonIndex = userinfo.indexOf(':');
  if (colonIndex === -1) return url;
  const user = userinfo.substring(0, colonIndex);
  const rawPass = userinfo.substring(colonIndex + 1);
  const encodedPass = encodeURIComponent(decodeURIComponent(rawPass));
  return `${protocolMatch[1]}${encodeURIComponent(decodeURIComponent(user))}:${encodedPass}@${hostportdb}`;
}

async function syncOrExportData() {
  console.log('=====================================================');
  console.log('📦 KOLA EXPRESS DATA SYNC / EXPORT UTILITY');
  console.log('=====================================================');

  const rawDbUrl = process.env.DATABASE_URL;
  const isExportOnly = process.argv.includes('--export-only') || !rawDbUrl || rawDbUrl.includes('your_db_password');
  const dbUrl = sanitizeDbUrl(rawDbUrl);

  // Tables to sync in order of foreign key dependency
  const tables = [
    'pricing_rules',
    'users',
    'couriers',
    'deliveries',
    'handover_confirmations',
    'delivery_status_history',
    'payments',
    'admin_logs'
  ];

  let sqlStatements = [];
  sqlStatements.push('-- =============================================================================');
  sqlStatements.push('-- KOLA EXPRESS DATA EXPORT FROM LIVE SQLITE DATABASE');
  sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
  sqlStatements.push('-- Non-destructive, idempotent insert with ON CONFLICT DO NOTHING');
  sqlStatements.push('-- =============================================================================\n');

  let totalRecords = 0;

  for (const table of tables) {
    let rows = [];
    try {
      rows = db.prepare(`SELECT * FROM ${table}`).all();
    } catch (err) {
      console.warn(`⚠️ Could not read table ${table}: ${err.message}`);
      continue;
    }

    console.log(`✓ Read ${rows.length} rows from [${table}]`);
    totalRecords += rows.length;

    if (rows.length === 0) continue;

    sqlStatements.push(`-- Table: ${table} (${rows.length} records)`);

    rows.forEach(row => {
      const cols = Object.keys(row);
      const colNames = cols.map(c => `"${c}"`).join(', ');
      
      const values = cols.map(c => {
        const val = row[c];
        if (val === null || val === undefined) {
          if (c === 'timestamp' || c === 'created_at') {
            return "timezone('utc'::text, now())";
          }
          return 'NULL';
        }
        if (typeof val === 'number') return val;
        // Escape single quotes for SQL
        const escaped = String(val).replace(/'/g, "''");
        return `'${escaped}'`;
      }).join(', ');

      // Primary key conflict target
      const conflictCol = cols.includes('id') ? '(id)' : '';
      const conflictClause = conflictCol ? ` ON CONFLICT ${conflictCol} DO NOTHING` : '';

      sqlStatements.push(`INSERT INTO public."${table}" (${colNames}) VALUES (${values})${conflictClause};`);
    });

    sqlStatements.push('');
  }

  // Update PostgreSQL BIGSERIAL sequences after insert so new inserts don't collide
  sqlStatements.push('-- Reset sequences to match max ids');
  tables.forEach(t => {
    sqlStatements.push(`SELECT setval(pg_get_serial_sequence('public."${t}"', 'id'), COALESCE(max(id), 1)) FROM public."${t}";`);
  });

  const fullSql = sqlStatements.join('\n');
  fs.writeFileSync(EXPORT_FILE, fullSql, 'utf8');
  console.log(`\n✓ Successfully generated SQL data export:`);
  console.log(`  ${EXPORT_FILE} (${totalRecords} records, ${(fullSql.length / 1024).toFixed(1)} KB)`);

  if (!isExportOnly && dbUrl) {
    console.log('\nConnecting to Supabase PostgreSQL database...');
    const { Client } = require('pg');
    const client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('✓ Connected to Supabase PostgreSQL.');
      console.log('Executing idempotent data sync...');
      await client.query(fullSql);
      console.log('✓ Successfully synced all SQLite data to Supabase!');
      await client.end();
    } catch (pgErr) {
      console.error('❌ Direct sync failed:', pgErr.message);
      console.log('💡 Note: You can apply the generated SQL export directly via Supabase Dashboard SQL Editor:');
      console.log(`   ${EXPORT_FILE}`);
    }
  } else {
    console.log('\nℹ️ No live DATABASE_URL provided. Export file ready for import into Supabase.');
  }

  console.log('=====================================================');
}

if (require.main === module) {
  syncOrExportData().catch(err => {
    console.error('Fatal sync error:', err);
    process.exit(1);
  });
}

module.exports = { syncOrExportData };
