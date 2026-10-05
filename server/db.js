const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'kola_express.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('customer', 'courier', 'admin')) NOT NULL DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate users table if phone still has NOT NULL constraint
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all();
    const phoneCol = userCols.find(c => c.name === 'phone');
    if (phoneCol && phoneCol.notnull === 1) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE users_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          full_name TEXT NOT NULL,
          phone TEXT UNIQUE,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT CHECK(role IN ('customer', 'courier', 'admin')) NOT NULL DEFAULT 'customer',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO users_migrated (id, full_name, phone, email, password_hash, role, created_at)
          SELECT id, full_name, phone, email, password_hash, role, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        PRAGMA foreign_keys = ON;
      `);
      console.log('✓ Users table migrated to allow registration via email or phone.');
    }
  } catch (migErr) {
    console.warn('Users table migration check warning:', migErr.message);
  }

  db.exec(`

    CREATE TABLE IF NOT EXISTS couriers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      full_name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      vehicle_type TEXT DEFAULT 'Boda Boda (Motorcycle)',
      plate_number TEXT NOT NULL,
      status TEXT CHECK(status IN ('active', 'busy', 'offline')) NOT NULL DEFAULT 'active',
      rating REAL DEFAULT 4.9,
      total_trips INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_fee INTEGER NOT NULL DEFAULT 4000,
      per_km_rate INTEGER NOT NULL DEFAULT 800,
      min_fee INTEGER NOT NULL DEFAULT 3500,
      urgent_surcharge INTEGER NOT NULL DEFAULT 3000,
      category_surcharges TEXT NOT NULL, -- JSON string
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
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
      distance_km REAL NOT NULL DEFAULT 5.0,
      delivery_fee INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Awaiting Payment',
      courier_id INTEGER,
      courier_assigned_at DATETIME,
      courier_arrived_at DATETIME,
      handover_confirmed_at DATETIME,
      handover_confirmation_id TEXT,
      handover_sender_id INTEGER,
      handover_status TEXT,
      handover_notes TEXT,
      delivery_pin TEXT,
      pin_verified_at DATETIME,
      delivery_confirmed_by_pin INTEGER DEFAULT 0,
      picked_up_at DATETIME,
      delivered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(courier_id) REFERENCES couriers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS handover_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      handover_id TEXT UNIQUE NOT NULL,
      delivery_id INTEGER NOT NULL,
      tracking_number TEXT NOT NULL,
      sender_id INTEGER,
      sender_name TEXT NOT NULL,
      sender_phone TEXT NOT NULL,
      courier_id INTEGER NOT NULL,
      courier_name TEXT NOT NULL,
      courier_phone TEXT NOT NULL,
      courier_arrived_at DATETIME,
      confirmed_at DATETIME,
      previous_status TEXT NOT NULL DEFAULT 'Awaiting Sender Confirmation',
      new_status TEXT NOT NULL DEFAULT 'Package Picked Up',
      confirmation_type TEXT NOT NULL DEFAULT 'sender_digital_handover',
      status TEXT NOT NULL DEFAULT 'confirmed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
      FOREIGN KEY(courier_id) REFERENCES couriers(id) ON DELETE SET NULL,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS delivery_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      updated_by TEXT DEFAULT 'System',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id INTEGER NOT NULL,
      tracking_number TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'UGX',
      payment_method TEXT NOT NULL, -- 'MTN Mobile Money' | 'Airtel Money'
      customer_phone TEXT NOT NULL,
      reference_id TEXT UNIQUE NOT NULL,
      payment_status TEXT CHECK(payment_status IN ('Pending', 'Successful', 'Failed')) NOT NULL DEFAULT 'Pending',
      provider_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      admin_name TEXT NOT NULL,
      admin_role TEXT DEFAULT 'super_admin',
      action TEXT NOT NULL,
      resource TEXT,
      resource_id TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate users table columns if running against existing database
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!userCols.includes('admin_role')) {
      db.exec("ALTER TABLE users ADD COLUMN admin_role TEXT DEFAULT 'super_admin';");
    }
    if (!userCols.includes('is_active')) {
      db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;");
    }
  } catch (userColErr) {
    console.warn('Users table column migration check warning:', userColErr.message);
  }

  // Migrate admin_logs columns if running against existing database
  try {
    const logCols = db.prepare('PRAGMA table_info(admin_logs)').all().map(c => c.name);
    const newLogCols = [
      { name: 'admin_id', type: 'INTEGER' },
      { name: 'admin_role', type: "TEXT DEFAULT 'super_admin'" },
      { name: 'resource', type: 'TEXT' },
      { name: 'resource_id', type: 'TEXT' }
    ];
    newLogCols.forEach(col => {
      if (!logCols.includes(col.name)) {
        db.exec(`ALTER TABLE admin_logs ADD COLUMN ${col.name} ${col.type};`);
      }
    });
  } catch (logColErr) {
    console.warn('Admin logs table column migration check warning:', logColErr.message);
  }

  // Migrate deliveries columns if running against existing database
  try {
    const deliveryCols = db.prepare('PRAGMA table_info(deliveries)').all().map(c => c.name);
    const newCols = [
      { name: 'courier_arrived_at', type: 'DATETIME' },
      { name: 'handover_confirmed_at', type: 'DATETIME' },
      { name: 'handover_confirmation_id', type: 'TEXT' },
      { name: 'handover_sender_id', type: 'INTEGER' },
      { name: 'handover_status', type: 'TEXT' },
      { name: 'handover_notes', type: 'TEXT' },
      { name: 'courier_confirmed_at', type: 'DATETIME' },
      { name: 'courier_confirmed_received', type: 'INTEGER DEFAULT 0' },
      { name: 'delivery_pin', type: 'TEXT' },
      { name: 'pin_verified_at', type: 'DATETIME' },
      { name: 'delivery_confirmed_by_pin', type: 'INTEGER DEFAULT 0' }
    ];
    newCols.forEach(col => {
      if (!deliveryCols.includes(col.name)) {
        db.exec(`ALTER TABLE deliveries ADD COLUMN ${col.name} ${col.type};`);
      }
    });

    // Ensure all 3 administrative roles exist: Super Admin, Operations Admin, and Finance Admin
    const ensureAdmin = (fullName, email, phone, role, adminRole, plainPassword) => {
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
      const hash = bcrypt.hashSync(plainPassword, 10);
      if (existing) {
        db.prepare("UPDATE users SET role = ?, admin_role = ?, is_active = 1 WHERE id = ?").run(role, adminRole, existing.id);
      } else {
        db.prepare(`
          INSERT INTO users (full_name, phone, email, password_hash, role, admin_role, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).run(fullName, phone, email, hash, role, adminRole);
      }
    };

    ensureAdmin('Super Administrator', 'admin@kolaexpress.ug', '0700000000', 'admin', 'super_admin', 'admin123');
    ensureAdmin('Operations Director', 'ops@kolaexpress.ug', '0770112233', 'admin', 'operations_admin', 'ops123');
    ensureAdmin('Finance Officer', 'finance@kolaexpress.ug', '0770445566', 'admin', 'finance_admin', 'finance123');

    // Ensure all deliveries have a special 4-digit recipient verification PIN
    const unpinned = db.prepare("SELECT id, tracking_number, status FROM deliveries WHERE delivery_pin IS NULL OR delivery_pin = ''").all();
    if (unpinned.length > 0) {
      const updatePin = db.prepare("UPDATE deliveries SET delivery_pin = ?, delivery_confirmed_by_pin = ?, pin_verified_at = ? WHERE id = ?");
      unpinned.forEach(d => {
        let pin = '4829';
        let confirmed = 0;
        let verifiedAt = null;
        if (d.tracking_number === 'KOLA-20261005-000188') {
          pin = '7315';
        } else if (d.tracking_number === 'KOLA-20261005-000123') {
          pin = '4829';
        } else if (d.tracking_number === 'KOLA-20261004-000982') {
          pin = '9241';
          confirmed = 1;
          verifiedAt = new Date().toISOString();
        } else {
          pin = Math.floor(1000 + Math.random() * 9000).toString();
        }
        updatePin.run(pin, confirmed, verifiedAt, d.id);
      });
      console.log(`✓ Generated Special Delivery PINs for ${unpinned.length} deliveries.`);
    }

    // Ensure sample handover data exists in deliveries & handover_confirmations
    const sampleDelivery = db.prepare("SELECT * FROM deliveries WHERE tracking_number = 'KOLA-20261005-000123'").get();
    if (sampleDelivery && !sampleDelivery.handover_confirmation_id) {
      db.prepare(`
        UPDATE deliveries 
        SET courier_arrived_at = datetime('now', '-45 minutes'),
            handover_confirmed_at = datetime('now', '-30 minutes'),
            handover_confirmation_id = 'KOLA-HO-20261005-000123',
            handover_sender_id = 5,
            handover_status = 'confirmed',
            delivery_pin = '4829'
        WHERE tracking_number = 'KOLA-20261005-000123'
      `).run();

      db.prepare(`
        INSERT OR IGNORE INTO handover_confirmations (
          handover_id, delivery_id, tracking_number, sender_id, sender_name, sender_phone,
          courier_id, courier_name, courier_phone, courier_arrived_at, confirmed_at,
          previous_status, new_status, confirmation_type, status, notes
        ) VALUES (
          'KOLA-HO-20261005-000123', ?, 'KOLA-20261005-000123', 5, 'Sarah Namubiru', '0775123456',
          1, 'Musa Ssewankambo', '0772100201', datetime('now', '-45 minutes'), datetime('now', '-30 minutes'),
          'Awaiting Sender Confirmation', 'Package Picked Up', 'sender_digital_handover', 'confirmed',
          'Sender confirmed package handover at pickup location'
        )
      `).run(sampleDelivery.id);
    }

    // Ensure active Awaiting Sender Confirmation demo delivery exists for instant interactive testing
    const activeAwaiting = db.prepare("SELECT * FROM deliveries WHERE tracking_number = 'KOLA-20261005-000188'").get();
    if (!activeAwaiting) {
      const sarahUser = db.prepare("SELECT id FROM users WHERE phone = '0775123456'").get();
      const musaCourier = db.prepare("SELECT id FROM couriers WHERE phone = '0772100201'").get();
      if (sarahUser && musaCourier) {
        const insRes = db.prepare(`
          INSERT INTO deliveries (
            tracking_number, customer_id, sender_name, sender_phone,
            pickup_location, pickup_directions, pickup_notes,
            recipient_name, recipient_phone, delivery_location,
            delivery_directions, delivery_notes, item_description,
            item_category, special_instructions, is_urgent,
            distance_km, delivery_fee, status, courier_id,
            courier_assigned_at, courier_arrived_at, delivery_pin, created_at
          ) VALUES (
            'KOLA-20261005-000188', ?, 'Sarah Namubiru', '0775123456',
            'Kikuubo Commercial Plaza, Downtown Kampala', 'Ground floor, shop G-14 opposite wholesale line', 'Ready for handover',
            'Alex Kato', '0705123987', 'Acacia Mall, Kisementi, Kololo',
            'First floor, Cafe entrance', 'Call recipient when arriving', 'Urgent Corporate Tender Documents & Seal',
            'document', 'Keep dry, handle with priority', 1,
            5.4, 11500, 'Awaiting Sender Confirmation', ?,
            datetime('now', '-20 minutes'), datetime('now', '-5 minutes'), '7315', datetime('now', '-40 minutes')
          )
        `).run(sarahUser.id, musaCourier.id);

        const dId = insRes.lastInsertRowid;
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Request Created', 'Express delivery request submitted', 'Customer', datetime('now', '-40 minutes'))
        `).run(dId);
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Payment Confirmed', 'Cashless payment confirmed UGX 11,500', 'Payment Gateway', datetime('now', '-35 minutes'))
        `).run(dId);
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Courier Assigned', 'Assigned to courier Musa Ssewankambo (Boda Boda UFA 482B)', 'Admin', datetime('now', '-20 minutes'))
        `).run(dId);
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Courier En Route to Pickup', 'Courier heading to Kikuubo Commercial Plaza', 'Courier', datetime('now', '-15 minutes'))
        `).run(dId);
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Courier Arrived at Pickup', 'Courier Musa Ssewankambo arrived at pickup location. Awaiting sender package handover confirmation.', 'Courier', datetime('now', '-5 minutes'))
        `).run(dId);
        db.prepare(`
          INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
          VALUES (?, 'Awaiting Sender Confirmation', 'Handover confirmation requested from sender Sarah Namubiru', 'System', datetime('now', '-5 minutes'))
        `).run(dId);
      }
    }
  } catch (colErr) {
    console.warn('Deliveries table column migration warning:', colErr.message);
  }

  seedInitialData();
}

function seedInitialData() {
  // Check if pricing rules exist
  const existingRules = db.prepare('SELECT * FROM pricing_rules LIMIT 1').get();
  if (!existingRules) {
    const defaultCategories = JSON.stringify({
      document: 0,
      small_parcel: 500,
      medium_box: 1500,
      large_package: 3000,
      groceries: 1000,
      fragile: 2000
    });

    db.prepare(`
      INSERT INTO pricing_rules (base_fee, per_km_rate, min_fee, urgent_surcharge, category_surcharges)
      VALUES (?, ?, ?, ?, ?)
    `).run(4000, 800, 3500, 3000, defaultCategories);
  }

  // Check if users exist
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existingUsers.count === 0) {
    const adminPass = bcrypt.hashSync('admin123', 10);
    const courierPass = bcrypt.hashSync('courier123', 10);
    const customerPass = bcrypt.hashSync('customer123', 10);

    // Admin user
    const adminInsert = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('Kola Administrator', '0700000000', 'admin@kolaexpress.ug', adminPass, 'admin');

    // Courier users
    const c1 = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('Musa Ssewankambo', '0772100201', 'musa@kolaexpress.ug', courierPass, 'courier');

    const c2 = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('Denis Okello', '0701445678', 'denis@kolaexpress.ug', courierPass, 'courier');

    const c3 = db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('Brian Katende', '0782555901', 'brian@kolaexpress.ug', courierPass, 'courier');

    // Customer user
    db.prepare(`
      INSERT INTO users (full_name, phone, email, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('Sarah Namubiru', '0775123456', 'sarah@example.com', customerPass, 'customer');

    // Couriers table records
    db.prepare(`
      INSERT INTO couriers (user_id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(c1.lastInsertRowid, 'Musa Ssewankambo', '0772100201', 'Boda Boda (Bajaj Boxer)', 'UFA 482B', 'active', 4.95, 142);

    db.prepare(`
      INSERT INTO couriers (user_id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(c2.lastInsertRowid, 'Denis Okello', '0701445678', 'Boda Boda (TVS HLX)', 'UFE 912K', 'active', 4.88, 98);

    db.prepare(`
      INSERT INTO couriers (user_id, full_name, phone, vehicle_type, plate_number, status, rating, total_trips)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(c3.lastInsertRowid, 'Brian Katende', '0782555901', 'Boda Boda (Yamaha Crux)', 'UFB 334M', 'active', 4.92, 115);

    // Seed sample deliveries
    seedSampleDeliveries();
  }
}

function seedSampleDeliveries() {
  const insertDelivery = db.prepare(`
    INSERT INTO deliveries (
      tracking_number, customer_id, sender_name, sender_phone,
      pickup_location, pickup_directions, pickup_notes,
      recipient_name, recipient_phone, delivery_location,
      delivery_directions, delivery_notes, item_description,
      item_category, special_instructions, is_urgent,
      distance_km, delivery_fee, status, courier_id,
      courier_assigned_at, picked_up_at, delivered_at, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, datetime('now', ?)
    )
  `);

  const insertHistory = db.prepare(`
    INSERT INTO delivery_status_history (delivery_id, status, note, updated_by, timestamp)
    VALUES (?, ?, ?, ?, datetime('now', ?))
  `);

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      delivery_id, tracking_number, amount, currency, payment_method,
      customer_phone, reference_id, payment_status, provider_response, created_at, confirmed_at
    ) VALUES (?, ?, ?, 'UGX', ?, ?, ?, 'Successful', ?, datetime('now', ?), datetime('now', ?))
  `);

  // 1. In Transit delivery
  const d1 = insertDelivery.run(
    'KOLA-20261005-000123', 5, 'Sarah Namubiru', '0775123456',
    'Kikuubo Commercial Plaza, Downtown Kampala', 'Ground floor, shop G-14 opposite wholesale line', 'Ask for Sarah or call upon arrival',
    'John Doe', '0702987654', 'Ntinda Complex, Ntinda Road',
    'Block B, 2nd floor, Tech Hub office', 'Call recipient when parked outside', 'Legal Contract Documents & Corporate Stamp',
    'document', 'Keep documents flat and dry in waterproof sleeve', 1,
    7.5, 12500, 'In Transit', 1,
    new Date(Date.now() - 3600000).toISOString(),
    new Date(Date.now() - 1800000).toISOString(),
    null,
    '-2 hours'
  );

  insertHistory.run(d1.lastInsertRowid, 'Request Created', 'Customer created express delivery request', 'Customer', '-2 hours');
  insertHistory.run(d1.lastInsertRowid, 'Awaiting Payment', 'Payment request generated for UGX 12,500', 'System', '-1 hour 55 minutes');
  insertHistory.run(d1.lastInsertRowid, 'Payment Confirmed', 'MTN Mobile Money payment verified successfully (Ref: MM-261005-49211)', 'Payment Gateway', '-1 hour 50 minutes');
  insertHistory.run(d1.lastInsertRowid, 'Courier Assigned', 'Assigned to courier Musa Ssewankambo (Boda Boda UFA 482B)', 'Admin', '-1 hour 20 minutes');
  insertHistory.run(d1.lastInsertRowid, 'Courier En Route to Pickup', 'Courier heading to Kikuubo Commercial Plaza', 'Courier', '-1 hour 10 minutes');
  insertHistory.run(d1.lastInsertRowid, 'Item Picked Up', 'Item picked up and inspected from sender Sarah', 'Courier', '-30 minutes');
  insertHistory.run(d1.lastInsertRowid, 'In Transit', 'Package en route via Jinja Road to Ntinda Complex', 'Courier', '-15 minutes');

  insertPayment.run(
    d1.lastInsertRowid, 'KOLA-20261005-000123', 12500, 'MTN Mobile Money',
    '0775123456', 'MM-261005-49211', JSON.stringify({ status: 'SUCCESS', network: 'MTN UG', txnId: 'MTN-884920' }),
    '-1 hour 50 minutes', '-1 hour 50 minutes'
  );

  // 2. Delivered item
  const d2 = insertDelivery.run(
    'KOLA-20261004-000982', 5, 'Kato Robert', '0782334455',
    'Acacia Mall, Kisementi, Kololo', 'Main entrance ground floor cafe', 'Package ready at counter',
    'Grace Akello', '0754889900', 'Village Mall, Bugolobi',
    'Upper parking, entrance to boutique 12', 'Hand delivery to recipient in person', 'Handmade leather shoes box',
    'small_parcel', 'Handle with care', 0,
    5.2, 8500, 'Delivered', 2,
    new Date(Date.now() - 86400000).toISOString(),
    new Date(Date.now() - 82800000).toISOString(),
    new Date(Date.now() - 79200000).toISOString(),
    '-1 day'
  );

  insertHistory.run(d2.lastInsertRowid, 'Request Created', 'Delivery request created', 'Customer', '-24 hours');
  insertHistory.run(d2.lastInsertRowid, 'Payment Confirmed', 'Airtel Money verified UGX 8,500 (Ref: AM-261004-18239)', 'Payment Gateway', '-23 hours 50 minutes');
  insertHistory.run(d2.lastInsertRowid, 'Courier Assigned', 'Assigned to Denis Okello (UFE 912K)', 'Dispatcher', '-23 hours');
  insertHistory.run(d2.lastInsertRowid, 'Item Picked Up', 'Package collected at Acacia Mall', 'Courier', '-22 hours');
  insertHistory.run(d2.lastInsertRowid, 'Delivered', 'Delivered safely to Grace Akello at Village Mall Bugolobi', 'Courier', '-21 hours');

  insertPayment.run(
    d2.lastInsertRowid, 'KOLA-20261004-000982', 8500, 'Airtel Money',
    '0782334455', 'AM-261004-18239', JSON.stringify({ status: 'SUCCESS', network: 'Airtel UG', txnId: 'AIR-992102' }),
    '-23 hours 50 minutes', '-23 hours 50 minutes'
  );

  // 3. Payment Confirmed / Ready for courier assignment
  const d3 = insertDelivery.run(
    'KOLA-20261005-000145', null, 'David Mukasa', '0702111222',
    'Nakasero Market, Kampala', 'Stall 45, fresh produce section', 'Packed securely in sealed carton',
    'Florence Nalwanga', '0779887766', 'Kansanga, Ggaba Road',
    'Near KIU main gate, green gate residence', 'Please call before arrival', 'Fresh organic fruits and local honey',
    'groceries', 'Keep upright', 0,
    6.8, 9800, 'Payment Confirmed', null,
    null, null, null,
    '-30 minutes'
  );

  insertHistory.run(d3.lastInsertRowid, 'Request Created', 'Express delivery request submitted', 'Customer', '-30 minutes');
  insertHistory.run(d3.lastInsertRowid, 'Payment Confirmed', 'MTN Mobile Money verified UGX 9,800 (Ref: MM-261005-88124)', 'Payment Gateway', '-25 minutes');

  insertPayment.run(
    d3.lastInsertRowid, 'KOLA-20261005-000145', 9800, 'MTN Mobile Money',
    '0702111222', 'MM-261005-88124', JSON.stringify({ status: 'SUCCESS', network: 'MTN UG', txnId: 'MTN-102934' }),
    '-25 minutes', '-25 minutes'
  );
}

module.exports = {
  db,
  initDatabase
};
