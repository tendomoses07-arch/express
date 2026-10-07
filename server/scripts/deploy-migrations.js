/**
 * Kola Express - Direct Supabase Migration Runner
 * Applies version-controlled SQL migrations directly to remote Supabase PostgreSQL
 * without requiring the Supabase CLI, Go binary, or Docker.
 *
 * Usage:
 *   node server/scripts/deploy-migrations.js
 *   npm run db:deploy
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

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

async function deployMigrations() {
  console.log('=====================================================');
  console.log('🚀 KOLA EXPRESS SUPABASE MIGRATION DEPLOYER');
  console.log('=====================================================');

  const rawDbUrl = process.env.DATABASE_URL;

  if (!rawDbUrl || rawDbUrl.includes('your_db_password') || rawDbUrl.includes('[YOUR-PASSWORD]')) {
    console.error('❌ DATABASE_URL is not configured with your real database password.');
    console.log('\nTo deploy migrations directly to Supabase, update your .env file:');
    console.log('DATABASE_URL=postgresql://postgres:[YOUR_DB_PASSWORD]@db.cyfujsembidukddrnyth.supabase.co:5432/postgres\n');
    console.log('Alternatively, you can copy and paste the migration files directly into');
    console.log('the Supabase Dashboard SQL Editor:');
    console.log('🔗 https://supabase.com/dashboard/project/cyfujsembidukddrnyth/sql');
    console.log('=====================================================');
    process.exit(1);
  }

  const dbUrl = sanitizeDbUrl(rawDbUrl);
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to remote Supabase PostgreSQL database...');
    const client = await pool.connect();
    console.log('✓ Successfully connected to Supabase database.');

    // Ensure migrations tracking table exists (Supabase standard)
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS supabase_migrations;
      CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version TEXT PRIMARY KEY,
        statements TEXT[],
        name TEXT
      );
    `);

    // Get applied migrations
    const res = await client.query('SELECT version FROM supabase_migrations.schema_migrations;');
    const appliedVersions = new Set(res.rows.map(r => r.version));

    // Read local migration files in chronological order
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
    console.log(`\nFound ${files.length} local migration files.`);

    let newlyApplied = 0;

    for (const file of files) {
      const version = file.split('_')[0];
      const name = file.replace(`${version}_`, '').replace('.sql', '');

      if (appliedVersions.has(version)) {
        console.log(`  [ALREADY APPLIED] ${file}`);
        continue;
      }

      console.log(`\nApplying migration: ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1, $2);',
          [version, name]
        );
        await client.query('COMMIT');
        console.log(`  ✓ Successfully applied: ${file}`);
        newlyApplied++;
      } catch (migErr) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed applying ${file}: ${migErr.message}`);
        throw migErr;
      }
    }

    client.release();
    await pool.end();

    console.log('\n=====================================================');
    if (newlyApplied > 0) {
      console.log(`🎉 Successfully applied ${newlyApplied} pending migration(s) to Supabase!`);
    } else {
      console.log('✓ Database is up to date. No pending migrations.');
    }
    console.log('=====================================================');

  } catch (err) {
    console.error('\n❌ Migration deployment failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  deployMigrations();
}

module.exports = { deployMigrations };
