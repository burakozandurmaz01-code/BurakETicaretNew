const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'burak-eticaret-secret-key-2024';
const DB_PATH = path.join(__dirname, 'database', 'burak_eticaret.db');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/client', express.static(path.join(__dirname, 'client', 'build')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Sadece resim dosyaları yüklenebilir'));
  }
});

// Database initialization
const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err);
  } else {
    console.log('Veritabanına bağlandı');
    initializeDatabase();
  }
});

function initializeDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT UNIQUE,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'tr',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Categories table
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    parent_id TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categories(id)
  )`);

  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    cost_price REAL,
    stock_quantity INTEGER DEFAULT 0,
    category_id TEXT,
    sku TEXT UNIQUE,
    barcode TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  )`);

  // Customers table
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    tax_number TEXT,
    tax_office TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Orders table
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    order_number TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    subtotal REAL NOT NULL,
    tax REAL DEFAULT 0,
    shipping_cost REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  )`);

  // Order items table
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);

  // Settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create default admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (id, username, password, email, full_name, role) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    ['admin', 'admin', adminPassword, 'admin@buraketicaret.com', 'Sistem Yöneticisi', 'admin']
  );

  // Create default settings
  const defaultSettings = [
    ['company_name', 'Burak E-Ticaret'],
    ['tax_rate', '20'],
    ['currency', 'TRY'],
    ['phone', '+90 555 123 4567'],
    ['email', 'info@buraketicaret.com'],
    ['address', 'İstanbul, Türkiye']
  ];

  defaultSettings.forEach(([key, value]) => {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  });
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Yetkilendirme token\'ı gerekli' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Geçersiz token' });
    }
    req.user = user;
    next();
  });
}

// Auth routes
app.post('/api/auth/login', [
  body('username').notEmpty().withMessage('Kullanıcı adı gerekli'),
  body('password').notEmpty().withMessage('Şifre gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        theme: user.theme,
        language: user.language
      }
    });
  });
});

app.post('/api/auth/register', [
  body('username').isLength({ min: 3 }).withMessage('Kullanıcı adı en az 3 karakter olmalı'),
  body('password').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalı'),
  body('email').isEmail().withMessage('Geçerli bir e-posta adresi gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, email, full_name } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  const userId = uuidv4();

  db.run('INSERT INTO users (id, username, password, email, full_name) VALUES (?, ?, ?, ?, ?)',
    [userId, username, hashedPassword, email, full_name],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Kullanıcı adı veya e-posta zaten kullanımda' });
        }
        return res.status(500).json({ error: 'Kayıt hatası' });
      }

      const token = jwt.sign(
        { id: userId, username, role: 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        token,
        user: { id: userId, username, email, full_name, role: 'user', theme: 'light', language: 'tr' }
      });
    }
  );
});

// User routes
app.get('/api/users/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, username, email, full_name, role, theme, language, created_at FROM users WHERE id = ?',
    [req.user.id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      if (!user) {
        return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
      }
      res.json(user);
    }
  );
});

app.put('/api/users/profile', authenticateToken, [
  body('email').optional().isEmail().withMessage('Geçerli bir e-posta adresi gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, full_name } = req.body;

  db.run('UPDATE users SET email = ?, full_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [email, full_name, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Güncelleme hatası' });
      }
      res.json({ message: 'Profil güncellendi' });
    }
  );
});

app.put('/api/users/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Mevcut şifre gerekli'),
  body('newPassword').isLength({ min: 6 }).withMessage('Yeni şifre en az 6 karakter olmalı')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { currentPassword, newPassword } = req.body;

  db.get('SELECT password FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Mevcut şifre hatalı' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    db.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashedPassword, req.user.id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Şifre güncelleme hatası' });
        }
        res.json({ message: 'Şifre başarıyla değiştirildi' });
      }
    );
  });
});

app.put('/api/users/theme', authenticateToken, (req, res) => {
  const { theme } = req.body;

  if (!['light', 'dark', 'auto'].includes(theme)) {
    return res.status(400).json({ error: 'Geçersiz tema değeri' });
  }

  db.run('UPDATE users SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [theme, req.user.id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Tema güncelleme hatası' });
      }
      res.json({ message: 'Tema güncellendi', theme });
    }
  );
});

// Category routes
app.get('/api/categories', authenticateToken, (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', [], (err, categories) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }
    res.json(categories);
  });
});

app.post('/api/categories', authenticateToken, [
  body('name').notEmpty().withMessage('Kategori adı gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, parent_id, image_url } = req.body;
  const categoryId = uuidv4();

  db.run('INSERT INTO categories (id, name, description, parent_id, image_url) VALUES (?, ?, ?, ?, ?)',
    [categoryId, name, description, parent_id, image_url],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Kategori oluşturma hatası' });
      }
      res.status(201).json({ id: categoryId, name, description, parent_id, image_url });
    }
  );
});

app.put('/api/categories/:id', authenticateToken, (req, res) => {
  const { name, description, parent_id, image_url } = req.body;
  const { id } = req.params;

  db.run('UPDATE categories SET name = ?, description = ?, parent_id = ?, image_url = ? WHERE id = ?',
    [name, description, parent_id, image_url, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Kategori güncelleme hatası' });
      }
      res.json({ message: 'Kategori güncellendi' });
    }
  );
});

app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM categories WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Kategori silme hatası' });
    }
    res.json({ message: 'Kategori silindi' });
  });
});

// Product routes
app.get('/api/products', authenticateToken, (req, res) => {
  const { category_id, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE 1=1
  `;
  const params = [];

  if (category_id) {
    query += ' AND p.category_id = ?';
    params.push(category_id);
  }

  if (search) {
    query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, products) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
    const countParams = [];

    if (category_id) {
      countQuery += ' AND category_id = ?';
      countParams.push(category_id);
    }

    if (search) {
      countQuery += ' AND (name LIKE ? OR description LIKE ? OR sku LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      res.json({
        products,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(result.total / limit)
      });
    });
  });
});

app.get('/api/products/:id', authenticateToken, (req, res) => {
  db.get('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
    [req.params.id],
    (err, product) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      if (!product) {
        return res.status(404).json({ error: 'Ürün bulunamadı' });
      }
      res.json(product);
    }
  );
});

app.post('/api/products', authenticateToken, upload.single('image'), [
  body('name').notEmpty().withMessage('Ürün adı gerekli'),
  body('price').isFloat({ min: 0 }).withMessage('Geçerli bir fiyat gerekli'),
  body('stock_quantity').isInt({ min: 0 }).withMessage('Geçerli bir stok miktarı gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, price, cost_price, stock_quantity, category_id, sku, barcode } = req.body;
  const productId = uuidv4();
  const image_url = req.file ? `/uploads/products/${req.file.filename}` : null;

  db.run(`INSERT INTO products (id, name, description, price, cost_price, stock_quantity, category_id, sku, barcode, image_url) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, name, description, price, cost_price, stock_quantity, category_id, sku, barcode, image_url],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ürün oluşturma hatası' });
      }
      res.status(201).json({
        id: productId,
        name,
        description,
        price,
        cost_price,
        stock_quantity,
        category_id,
        sku,
        barcode,
        image_url
      });
    }
  );
});

app.put('/api/products/:id', authenticateToken, upload.single('image'), (req, res) => {
  const { name, description, price, cost_price, stock_quantity, category_id, sku, barcode, is_active } = req.body;
  const { id } = req.params;

  let image_url = req.body.image_url;
  if (req.file) {
    image_url = `/uploads/products/${req.file.filename}`;
  }

  db.run(`UPDATE products SET name = ?, description = ?, price = ?, cost_price = ?, stock_quantity = ?, 
    category_id = ?, sku = ?, barcode = ?, image_url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, description, price, cost_price, stock_quantity, category_id, sku, barcode, image_url, is_active ? 1 : 0, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Ürün güncelleme hatası' });
      }
      res.json({ message: 'Ürün güncellendi' });
    }
  );
});

app.delete('/api/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Ürün silme hatası' });
    }
    res.json({ message: 'Ürün silindi' });
  });
});

// Customer routes
app.get('/api/customers', authenticateToken, (req, res) => {
  const { search } = req.query;

  let query = 'SELECT * FROM customers';
  const params = [];

  if (search) {
    query += ' WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY created_at DESC';

  db.all(query, params, (err, customers) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }
    res.json(customers);
  });
});

app.post('/api/customers', authenticateToken, [
  body('name').notEmpty().withMessage('Müşteri adı gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, phone, address, city, tax_number, tax_office } = req.body;
  const customerId = uuidv4();

  db.run(`INSERT INTO customers (id, name, email, phone, address, city, tax_number, tax_office) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, name, email, phone, address, city, tax_number, tax_office],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Müşteri oluşturma hatası' });
      }
      res.status(201).json({
        id: customerId,
        name,
        email,
        phone,
        address,
        city,
        tax_number,
        tax_office
      });
    }
  );
});

app.put('/api/customers/:id', authenticateToken, (req, res) => {
  const { name, email, phone, address, city, tax_number, tax_office } = req.body;
  const { id } = req.params;

  db.run(`UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?, 
    tax_number = ?, tax_office = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [name, email, phone, address, city, tax_number, tax_office, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Müşteri güncelleme hatası' });
      }
      res.json({ message: 'Müşteri güncellendi' });
    }
  );
});

app.delete('/api/customers/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM customers WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Müşteri silme hatası' });
    }
    res.json({ message: 'Müşteri silindi' });
  });
});

// Order routes
app.get('/api/orders', authenticateToken, (req, res) => {
  const { status, customer_id, start_date, end_date, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT o.*, c.name as customer_name 
    FROM orders o 
    LEFT JOIN customers c ON o.customer_id = c.id 
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND o.status = ?';
    params.push(status);
  }

  if (customer_id) {
    query += ' AND o.customer_id = ?';
    params.push(customer_id);
  }

  if (start_date) {
    query += ' AND o.created_at >= ?';
    params.push(start_date);
  }

  if (end_date) {
    query += ' AND o.created_at <= ?';
    params.push(end_date);
  }

  query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, orders) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM orders WHERE 1=1';
    const countParams = [];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (customer_id) {
      countQuery += ' AND customer_id = ?';
      countParams.push(customer_id);
    }

    if (start_date) {
      countQuery += ' AND created_at >= ?';
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ' AND created_at <= ?';
      countParams.push(end_date);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      res.json({
        orders,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(result.total / limit)
      });
    });
  });
});

app.get('/api/orders/:id', authenticateToken, (req, res) => {
  db.get('SELECT o.*, c.name as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = ?',
    [req.params.id],
    (err, order) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      if (!order) {
        return res.status(404).json({ error: 'Sipariş bulunamadı' });
      }

      // Get order items
      db.all(`SELECT oi.*, p.name as product_name 
        FROM order_items oi 
        LEFT JOIN products p ON oi.product_id = p.id 
        WHERE oi.order_id = ?`,
        [req.params.id],
        (err, items) => {
          if (err) {
            return res.status(500).json({ error: 'Veritabanı hatası' });
          }
          res.json({ ...order, items });
        }
      );
    }
  );
});

app.post('/api/orders', authenticateToken, [
  body('customer_id').notEmpty().withMessage('Müşteri gerekli'),
  body('items').isArray({ min: 1 }).withMessage('En az bir ürün gerekli')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { customer_id, items, notes, tax, shipping_cost, discount } = req.body;
  const orderId = uuidv4();
  const orderNumber = 'ORD-' + Date.now();

  // Calculate totals
  let subtotal = 0;
  items.forEach(item => {
    subtotal += item.unit_price * item.quantity;
  });

  const total = subtotal + (tax || 0) + (shipping_cost || 0) - (discount || 0);

  db.run(`INSERT INTO orders (id, customer_id, order_number, status, subtotal, tax, shipping_cost, discount, total, notes) 
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [orderId, customer_id, orderNumber, subtotal, tax || 0, shipping_cost || 0, discount || 0, total, notes],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Sipariş oluşturma hatası' });
      }

      // Insert order items
      const itemPromises = items.map(item => {
        return new Promise((resolve, reject) => {
          const orderItemId = uuidv4();
          const totalPrice = item.unit_price * item.quantity;

          db.run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [orderItemId, orderId, item.product_id, item.quantity, item.unit_price, totalPrice],
            function(err) {
              if (err) {
                reject(err);
              } else {
                // Update product stock
                db.run('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                  [item.quantity, item.product_id],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              }
            }
          );
        });
      });

      Promise.all(itemPromises)
        .then(() => {
          res.status(201).json({
            id: orderId,
            order_number: orderNumber,
            customer_id,
            subtotal,
            tax,
            shipping_cost,
            discount,
            total,
            notes,
            status: 'pending'
          });
        })
        .catch(err => {
          res.status(500).json({ error: 'Sipariş öğeleri oluşturma hatası' });
        });
    }
  );
});

app.put('/api/orders/:id', authenticateToken, (req, res) => {
  const { status, notes } = req.body;
  const { id } = req.params;

  db.run('UPDATE orders SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, notes, id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Sipariş güncelleme hatası' });
      }
      res.json({ message: 'Sipariş güncellendi' });
    }
  );
});

app.delete('/api/orders/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM order_items WHERE order_id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Sipariş silme hatası' });
    }

    db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Sipariş silme hatası' });
      }
      res.json({ message: 'Sipariş silindi' });
    });
  });
});

// Dashboard/Analytics routes
app.get('/api/dashboard/stats', authenticateToken, (req, res) => {
  const queries = [
    'SELECT COUNT(*) as total_products FROM products WHERE is_active = 1',
    'SELECT COUNT(*) as total_customers FROM customers',
    'SELECT COUNT(*) as total_orders FROM orders',
    'SELECT SUM(total) as total_revenue FROM orders WHERE status = "completed"',
    'SELECT COUNT(*) as pending_orders FROM orders WHERE status = "pending"',
    'SELECT SUM(stock_quantity) as low_stock FROM products WHERE stock_quantity < 10'
  ];

  Promise.all(queries.map(query => {
    return new Promise((resolve, reject) => {
      db.get(query, [], (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }))
  .then(results => {
    res.json({
      total_products: results[0].total_products || 0,
      total_customers: results[1].total_customers || 0,
      total_orders: results[2].total_orders || 0,
      total_revenue: results[3].total_revenue || 0,
      pending_orders: results[4].pending_orders || 0,
      low_stock: results[5].low_stock || 0
    });
  })
  .catch(err => {
    res.status(500).json({ error: 'İstatistik hatası' });
  });
});

app.get('/api/dashboard/recent-orders', authenticateToken, (req, res) => {
  db.all(`SELECT o.*, c.name as customer_name 
    FROM orders o 
    LEFT JOIN customers c ON o.customer_id = c.id 
    ORDER BY o.created_at DESC LIMIT 10`,
    [],
    (err, orders) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      res.json(orders);
    }
  );
});

app.get('/api/dashboard/sales-chart', authenticateToken, (req, res) => {
  const { days = 30 } = req.query;

  db.all(`SELECT DATE(created_at) as date, SUM(total) as total, COUNT(*) as count 
    FROM orders 
    WHERE status = 'completed' 
    AND created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(created_at) 
    ORDER BY date`,
    [days],
    (err, sales) => {
      if (err) {
        return res.status(500).json({ error: 'Veritabanı hatası' });
      }
      res.json(sales);
    }
  );
});

// Settings routes
app.get('/api/settings', authenticateToken, (req, res) => {
  db.all('SELECT * FROM settings', [], (err, settings) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    res.json(settingsObj);
  });
});

app.put('/api/settings', authenticateToken, (req, res) => {
  const settings = req.body;

  const promises = Object.entries(settings).map(([key, value]) => {
    return new Promise((resolve, reject) => {
      db.run(`INSERT INTO settings (key, value) VALUES (?, ?) 
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
        [key, value, value],
        function(err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  });

  Promise.all(promises)
    .then(() => {
      res.json({ message: 'Ayarlar güncellendi' });
    })
    .catch(err => {
      res.status(500).json({ error: 'Ayarlar güncelleme hatası' });
    });
});

// Export routes
app.get('/api/export/orders', authenticateToken, (req, res) => {
  const { start_date, end_date } = req.query;

  let query = `
    SELECT o.order_number, c.name as customer_name, o.status, o.total, o.created_at 
    FROM orders o 
    LEFT JOIN customers c ON o.customer_id = c.id 
    WHERE 1=1
  `;
  const params = [];

  if (start_date) {
    query += ' AND o.created_at >= ?';
    params.push(start_date);
  }

  if (end_date) {
    query += ' AND o.created_at <= ?';
    params.push(end_date);
  }

  query += ' ORDER BY o.created_at DESC';

  db.all(query, params, (err, orders) => {
    if (err) {
      return res.status(500).json({ error: 'Veritabanı hatası' });
    }

    // Convert to CSV
    const headers = ['Sipariş No', 'Müşteri', 'Durum', 'Toplam', 'Tarih'];
    const rows = orders.map(order => [
      order.order_number,
      order.customer_name,
      order.status,
      order.total,
      order.created_at
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=siparisler.csv');
    res.send(csv);
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
});
