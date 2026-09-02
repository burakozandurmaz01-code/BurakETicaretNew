from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
import sqlite3
import bcrypt
import os
import uuid
from datetime import datetime, timedelta
from functools import wraps
import hashlib
import io
from openpyxl import Workbook
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

app = Flask(__name__)
CORS(app)

# Configuration
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'burak-eticaret-secret-key-2024')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
jwt = JWTManager(app)

# Database - SQLite (Render deployment uses persistent disk or migrate to PostgreSQL later)
DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'database', 'burak_eticaret.db')

if not os.path.exists('database'):
    os.makedirs('database')

def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads', 'products')

# Ensure directories exist
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
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
        )
    ''')
    
    # Categories table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            parent_id TEXT,
            image_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES categories(id)
        )
    ''')
    
    # Products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
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
        )
    ''')
    
    # Customers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS customers (
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
        )
    ''')
    
    # Orders table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
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
        )
    ''')
    
    # Order items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS order_items (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            total_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    
    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Product variations table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS product_variations (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            phone_model TEXT,
            color TEXT,
            protection_type TEXT,
            price REAL NOT NULL,
            stock_quantity INTEGER DEFAULT 0,
            sku TEXT,
            barcode TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    
    # Stock movements table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            reference_id TEXT,
            reference_type TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    ''')
    
    # Suppliers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            contact_person TEXT,
            email TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            tax_number TEXT,
            tax_office TEXT,
            payment_terms TEXT,
            notes TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Returns/Refunds table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS returns (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            customer_id TEXT,
            return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            return_type TEXT NOT NULL,
            reason TEXT,
            status TEXT DEFAULT 'pending',
            refund_amount REAL,
            refund_method TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        )
    ''')
    
    # Return items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS return_items (
            id TEXT PRIMARY KEY,
            return_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            reason TEXT,
            condition TEXT,
            FOREIGN KEY (return_id) REFERENCES returns(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
    ''')
    
    # Coupons table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS coupons (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            discount_type TEXT NOT NULL,
            discount_value REAL NOT NULL,
            minimum_purchase REAL DEFAULT 0,
            max_discount REAL,
            usage_limit INTEGER,
            used_count INTEGER DEFAULT 0,
            valid_from DATETIME,
            valid_until DATETIME,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Finance transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS finance_transactions (
            id TEXT PRIMARY KEY,
            transaction_type TEXT NOT NULL,
            amount REAL NOT NULL,
            transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            category TEXT,
            description TEXT,
            reference_id TEXT,
            reference_type TEXT,
            payment_method TEXT,
            status TEXT DEFAULT 'completed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by TEXT,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    ''')
    
    # Activity logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            action TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            details TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    
    # Create default admin user
    admin_password = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    try:
        cursor.execute('''
            INSERT OR IGNORE INTO users (id, username, password, email, full_name, role)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', ('admin', 'admin', admin_password, 'admin@buraketicaret.com', 'Sistem Yöneticisi', 'admin'))
    except sqlite3.IntegrityError:
        pass
    
    # Create default settings
    default_settings = [
        ('company_name', 'Burak E-Ticaret'),
        ('tax_rate', '20'),
        ('currency', 'TRY'),
        ('phone', '+90 555 123 4567'),
        ('email', 'info@buraketicaret.com'),
        ('address', 'İstanbul, Türkiye')
    ]
    
    for key, value in default_settings:
        try:
            cursor.execute('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', (key, value))
        except sqlite3.IntegrityError:
            pass
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_db()

# Serve static files
@app.route('/')
def index():
    return send_from_directory('client', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('client', path)

@app.route('/uploads/<path:path>')
def serve_uploads(path):
    return send_from_directory('uploads', path)

# Auth routes
@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Kullanıcı adı ve şifre gerekli'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({'error': 'Geçersiz kullanıcı adı veya şifre'}), 401
    
    access_token = create_access_token(identity={
        'id': user['id'],
        'username': user['username'],
        'role': user['role']
    })
    
    return jsonify({
        'token': access_token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'full_name': user['full_name'],
            'role': user['role'],
            'theme': user['theme'],
            'language': user['language']
        }
    })

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    full_name = data.get('full_name')
    
    if not username or not password or len(username) < 3 or len(password) < 6:
        return jsonify({'error': 'Kullanıcı adı en az 3, şifre en az 6 karakter olmalı'}), 400
    
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user_id = str(uuid.uuid4())
    
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO users (id, username, password, email, full_name)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, username, hashed_password, email, full_name))
        conn.commit()
        conn.close()
        
        access_token = create_access_token(identity={
            'id': user_id,
            'username': username,
            'role': 'user'
        })
        
        return jsonify({
            'token': access_token,
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'full_name': full_name,
                'role': 'user',
                'theme': 'light',
                'language': 'tr'
            }
        }), 201
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Kullanıcı adı veya e-posta zaten kullanımda'}), 400

# User routes
@app.route('/api/users/profile', methods=['GET'])
def get_profile():
    user_id = request.headers.get('X-User-ID', 'admin')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, email, full_name, role, theme, language, created_at FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'error': 'Kullanıcı bulunamadı'}), 404
    
    return jsonify(dict(user))

@app.route('/api/users/profile', methods=['PUT'])
def update_profile():
    user_id = request.headers.get('X-User-ID', 'admin')
    data = request.json
    email = data.get('email')
    full_name = data.get('full_name')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE users SET email = ?, full_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (email, full_name, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Profil güncellendi'})

@app.route('/api/users/change-password', methods=['PUT'])
def change_password():
    user_id = request.headers.get('X-User-ID', 'admin')
    data = request.json
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')
    
    if not current_password or not new_password or len(new_password) < 6:
        return jsonify({'error': 'Geçersiz şifre bilgileri'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT password FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    
    if not user or not bcrypt.checkpw(current_password.encode('utf-8'), user['password'].encode('utf-8')):
        conn.close()
        return jsonify({'error': 'Mevcut şifre hatalı'}), 401
    
    hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    cursor.execute('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (hashed_password, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Şifre başarıyla değiştirildi'})

@app.route('/api/users/theme', methods=['PUT'])
def update_theme():
    user_id = request.headers.get('X-User-ID', 'admin')
    data = request.json
    theme = data.get('theme')
    
    if theme not in ['light', 'dark', 'auto']:
        return jsonify({'error': 'Geçersiz tema değeri'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE users SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (theme, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Tema güncellendi', 'theme': theme})

# Category routes
@app.route('/api/categories', methods=['GET'])
def get_categories():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM categories ORDER BY name')
    categories = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(cat) for cat in categories])

@app.route('/api/categories', methods=['POST'])
def create_category():
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'error': 'Kategori adı gerekli'}), 400
    
    category_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO categories (id, name, description, parent_id, image_url)
        VALUES (?, ?, ?, ?, ?)
    ''', (category_id, name, data.get('description'), data.get('parent_id'), data.get('image_url')))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': category_id,
        'name': name,
        'description': data.get('description'),
        'parent_id': data.get('parent_id'),
        'image_url': data.get('image_url')
    }), 201

@app.route('/api/categories/<id>', methods=['PUT'])
def update_category(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE categories SET name = ?, description = ?, parent_id = ?, image_url = ?
        WHERE id = ?
    ''', (data.get('name'), data.get('description'), data.get('parent_id'), data.get('image_url'), id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Kategori güncellendi'})

@app.route('/api/categories/<id>', methods=['DELETE'])
def delete_category(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM categories WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Kategori silindi'})

# Product routes
@app.route('/api/products', methods=['GET'])
def get_products():
    category_id = request.args.get('category_id')
    search = request.args.get('search', '')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE 1=1
    '''
    params = []
    
    if category_id:
        query += ' AND p.category_id = ?'
        params.append(category_id)
    
    if search:
        query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.sku LIKE ?)'
        search_pattern = f'%{search}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    products = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM products WHERE 1=1'
    count_params = []
    
    if category_id:
        count_query += ' AND category_id = ?'
        count_params.append(category_id)
    
    if search:
        count_query += ' AND (name LIKE ? OR description LIKE ? OR sku LIKE ?)'
        search_pattern = f'%{search}%'
        count_params.extend([search_pattern, search_pattern, search_pattern])
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'products': [dict(p) for p in products],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/products/<id>', methods=['GET'])
def get_product(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ?
    ''', (id,))
    product = cursor.fetchone()
    conn.close()
    
    if not product:
        return jsonify({'error': 'Ürün bulunamadı'}), 404
    
    return jsonify(dict(product))

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.json
    name = data.get('name')
    price = data.get('price')
    stock_quantity = data.get('stock_quantity')
    
    if not name or price is None or stock_quantity is None:
        return jsonify({'error': 'Gerekli alanlar eksik'}), 400
    
    product_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO products (id, name, description, price, cost_price, stock_quantity, category_id, sku, barcode, image_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        product_id,
        name,
        data.get('description'),
        price,
        data.get('cost_price'),
        stock_quantity,
        data.get('category_id'),
        data.get('sku'),
        data.get('barcode'),
        data.get('image_url'),
        data.get('is_active', True)
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': product_id,
        'name': name,
        'description': data.get('description'),
        'price': price,
        'cost_price': data.get('cost_price'),
        'stock_quantity': stock_quantity,
        'category_id': data.get('category_id'),
        'sku': data.get('sku'),
        'barcode': data.get('barcode'),
        'image_url': data.get('image_url'),
        'is_active': data.get('is_active', True)
    }), 201

@app.route('/api/products/<id>', methods=['PUT'])
def update_product(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE products SET name = ?, description = ?, price = ?, cost_price = ?, stock_quantity = ?,
        category_id = ?, sku = ?, barcode = ?, image_url = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('name'),
        data.get('description'),
        data.get('price'),
        data.get('cost_price'),
        data.get('stock_quantity'),
        data.get('category_id'),
        data.get('sku'),
        data.get('barcode'),
        data.get('image_url'),
        data.get('is_active', True),
        id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Ürün güncellendi'})

@app.route('/api/products/<id>', methods=['DELETE'])
def delete_product(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM products WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Ürün silindi'})

# Customer routes
@app.route('/api/customers', methods=['GET'])
def get_customers():
    search = request.args.get('search', '')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM customers'
    params = []
    
    if search:
        query += ' WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?'
        search_pattern = f'%{search}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    query += ' ORDER BY created_at DESC'
    
    cursor.execute(query, params)
    customers = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(c) for c in customers])

@app.route('/api/customers', methods=['POST'])
def create_customer():
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'error': 'Müşteri adı gerekli'}), 400
    
    customer_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO customers (id, name, email, phone, address, city, tax_number, tax_office)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        customer_id,
        name,
        data.get('email'),
        data.get('phone'),
        data.get('address'),
        data.get('city'),
        data.get('tax_number'),
        data.get('tax_office')
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': customer_id,
        'name': name,
        'email': data.get('email'),
        'phone': data.get('phone'),
        'address': data.get('address'),
        'city': data.get('city'),
        'tax_number': data.get('tax_number'),
        'tax_office': data.get('tax_office')
    }), 201

@app.route('/api/customers/<id>', methods=['PUT'])
def update_customer(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, city = ?,
        tax_number = ?, tax_office = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('name'),
        data.get('email'),
        data.get('phone'),
        data.get('address'),
        data.get('city'),
        data.get('tax_number'),
        data.get('tax_office'),
        id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Müşteri güncellendi'})

@app.route('/api/customers/<id>', methods=['DELETE'])
def delete_customer(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM customers WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Müşteri silindi'})

# Order routes
@app.route('/api/orders', methods=['GET'])
def get_orders():
    status = request.args.get('status')
    customer_id = request.args.get('customer_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT o.*, c.name as customer_name
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1
    '''
    params = []
    
    if status:
        query += ' AND o.status = ?'
        params.append(status)
    
    if customer_id:
        query += ' AND o.customer_id = ?'
        params.append(customer_id)
    
    if start_date:
        query += ' AND o.created_at >= ?'
        params.append(start_date)
    
    if end_date:
        query += ' AND o.created_at <= ?'
        params.append(end_date)
    
    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    orders = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM orders WHERE 1=1'
    count_params = []
    
    if status:
        count_query += ' AND status = ?'
        count_params.append(status)
    
    if customer_id:
        count_query += ' AND customer_id = ?'
        count_params.append(customer_id)
    
    if start_date:
        count_query += ' AND created_at >= ?'
        count_params.append(start_date)
    
    if end_date:
        count_query += ' AND created_at <= ?'
        count_params.append(end_date)
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'orders': [dict(o) for o in orders],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/orders/<id>', methods=['GET'])
def get_order(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT o.*, c.name as customer_name
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.id = ?
    ''', (id,))
    order = cursor.fetchone()
    
    if not order:
        conn.close()
        return jsonify({'error': 'Sipariş bulunamadı'}), 404
    
    cursor.execute('''
        SELECT oi.*, p.name as product_name
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
    ''', (id,))
    items = cursor.fetchall()
    conn.close()
    
    order_dict = dict(order)
    order_dict['items'] = [dict(i) for i in items]
    
    return jsonify(order_dict)

@app.route('/api/orders', methods=['POST'])
def create_order():
    data = request.json
    customer_id = data.get('customer_id')
    items = data.get('items', [])
    notes = data.get('notes')
    tax = data.get('tax', 0)
    shipping_cost = data.get('shipping_cost', 0)
    discount = data.get('discount', 0)
    
    if not customer_id or not items:
        return jsonify({'error': 'Müşteri ve en az bir ürün gerekli'}), 400
    
    # Calculate totals
    subtotal = sum(item['unit_price'] * item['quantity'] for item in items)
    total = subtotal + tax + shipping_cost - discount
    
    order_id = str(uuid.uuid4())
    order_number = f'ORD-{int(datetime.now().timestamp())}'
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO orders (id, customer_id, order_number, status, subtotal, tax, shipping_cost, discount, total, notes)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    ''', (order_id, customer_id, order_number, subtotal, tax, shipping_cost, discount, total, notes))
    
    # Insert order items
    for item in items:
        order_item_id = str(uuid.uuid4())
        total_price = item['unit_price'] * item['quantity']
        cursor.execute('''
            INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (order_item_id, order_id, item['product_id'], item['quantity'], item['unit_price'], total_price))
        
        # Update product stock
        cursor.execute('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', (item['quantity'], item['product_id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': order_id,
        'order_number': order_number,
        'customer_id': customer_id,
        'subtotal': subtotal,
        'tax': tax,
        'shipping_cost': shipping_cost,
        'discount': discount,
        'total': total,
        'notes': notes,
        'status': 'pending'
    }), 201

@app.route('/api/orders/<id>', methods=['PUT'])
def update_order(id):
    data = request.json
    status = data.get('status')
    notes = data.get('notes')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE orders SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (status, notes, id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Sipariş güncellendi'})

@app.route('/api/orders/<id>', methods=['DELETE'])
def delete_order(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM order_items WHERE order_id = ?', (id,))
    cursor.execute('DELETE FROM orders WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Sipariş silindi'})

# Dashboard routes
@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    conn = get_db()
    cursor = conn.cursor()
    
    stats = {}
    
    cursor.execute('SELECT COUNT(*) as total FROM products WHERE is_active = 1')
    stats['total_products'] = cursor.fetchone()['total']
    
    cursor.execute('SELECT COUNT(*) as total FROM customers')
    stats['total_customers'] = cursor.fetchone()['total']
    
    cursor.execute('SELECT COUNT(*) as total FROM orders')
    stats['total_orders'] = cursor.fetchone()['total']
    
    cursor.execute('SELECT SUM(total) as total FROM orders WHERE status = "completed"')
    result = cursor.fetchone()
    stats['total_revenue'] = result['total'] or 0
    
    cursor.execute('SELECT COUNT(*) as total FROM orders WHERE status = "pending"')
    stats['pending_orders'] = cursor.fetchone()['total']
    
    cursor.execute('SELECT SUM(stock_quantity) as total FROM products WHERE stock_quantity < 10')
    result = cursor.fetchone()
    stats['low_stock'] = result['total'] or 0
    
    conn.close()
    
    return jsonify(stats)

@app.route('/api/dashboard/recent-orders', methods=['GET'])
def get_recent_orders():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT o.*, c.name as customer_name
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        ORDER BY o.created_at DESC
        LIMIT 10
    ''')
    orders = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(o) for o in orders])

@app.route('/api/dashboard/sales-chart', methods=['GET'])
def get_sales_chart():
    days = int(request.args.get('days', 30))
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT DATE(created_at) as date, SUM(total) as total, COUNT(*) as count
        FROM orders
        WHERE status = 'completed'
        AND created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date
    ''', (days,))
    sales = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(s) for s in sales])

# Settings routes
@app.route('/api/settings', methods=['GET'])
def get_settings():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM settings')
    settings = cursor.fetchall()
    conn.close()
    
    settings_dict = {s['key']: s['value'] for s in settings}
    return jsonify(settings_dict)

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.json
    
    conn = get_db()
    cursor = conn.cursor()
    
    for key, value in data.items():
        cursor.execute('''
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        ''', (key, value, value))
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Ayarlar güncellendi'})

# Stock movements routes
@app.route('/api/stock-movements', methods=['GET'])
def get_stock_movements():
    product_id = request.args.get('product_id')
    movement_type = request.args.get('movement_type')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT sm.*, p.name as product_name, u.username as created_by_name
        FROM stock_movements sm
        LEFT JOIN products p ON sm.product_id = p.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE 1=1
    '''
    params = []
    
    if product_id:
        query += ' AND sm.product_id = ?'
        params.append(product_id)
    
    if movement_type:
        query += ' AND sm.movement_type = ?'
        params.append(movement_type)
    
    query += ' ORDER BY sm.created_at DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    movements = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM stock_movements WHERE 1=1'
    count_params = []
    
    if product_id:
        count_query += ' AND product_id = ?'
        count_params.append(product_id)
    
    if movement_type:
        count_query += ' AND movement_type = ?'
        count_params.append(movement_type)
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'movements': [dict(m) for m in movements],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/stock-movements', methods=['POST'])
def create_stock_movement():
    data = request.json
    product_id = data.get('product_id')
    movement_type = data.get('movement_type')
    quantity = data.get('quantity')
    
    if not product_id or not movement_type or not quantity:
        return jsonify({'error': 'Gerekli alanlar eksik'}), 400
    
    movement_id = str(uuid.uuid4())
    user_id = request.headers.get('X-User-ID', 'admin')
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Create stock movement record
    cursor.execute('''
        INSERT INTO stock_movements (id, product_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        movement_id,
        product_id,
        movement_type,
        quantity,
        data.get('reference_id'),
        data.get('reference_type'),
        data.get('notes'),
        user_id
    ))
    
    # Update product stock
    if movement_type == 'in':
        cursor.execute('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', (quantity, product_id))
    elif movement_type == 'out':
        cursor.execute('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', (quantity, product_id))
    elif movement_type == 'adjustment':
        cursor.execute('UPDATE products SET stock_quantity = ? WHERE id = ?', (quantity, product_id))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': movement_id,
        'product_id': product_id,
        'movement_type': movement_type,
        'quantity': quantity,
        'message': 'Stok hareketi kaydedildi'
    }), 201

# Suppliers routes
@app.route('/api/suppliers', methods=['GET'])
def get_suppliers():
    search = request.args.get('search', '')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM suppliers WHERE is_active = 1'
    params = []
    
    if search:
        query += ' AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ?)'
        search_pattern = f'%{search}%'
        params.extend([search_pattern, search_pattern, search_pattern])
    
    query += ' ORDER BY name'
    
    cursor.execute(query, params)
    suppliers = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(s) for s in suppliers])

@app.route('/api/suppliers', methods=['POST'])
def create_supplier():
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({'error': 'Tedarikçi adı gerekli'}), 400
    
    supplier_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO suppliers (id, name, contact_person, email, phone, address, city, tax_number, tax_office, payment_terms, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        supplier_id,
        name,
        data.get('contact_person'),
        data.get('email'),
        data.get('phone'),
        data.get('address'),
        data.get('city'),
        data.get('tax_number'),
        data.get('tax_office'),
        data.get('payment_terms'),
        data.get('notes')
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': supplier_id,
        'name': name,
        'message': 'Tedarikçi oluşturuldu'
    }), 201

@app.route('/api/suppliers/<id>', methods=['PUT'])
def update_supplier(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE suppliers SET name = ?, contact_person = ?, email = ?, phone = ?, address = ?, city = ?,
        tax_number = ?, tax_office = ?, payment_terms = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('name'),
        data.get('contact_person'),
        data.get('email'),
        data.get('phone'),
        data.get('address'),
        data.get('city'),
        data.get('tax_number'),
        data.get('tax_office'),
        data.get('payment_terms'),
        data.get('notes'),
        id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Tedarikçi güncellendi'})

@app.route('/api/suppliers/<id>', methods=['DELETE'])
def delete_supplier(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE suppliers SET is_active = 0 WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Tedarikçi silindi'})

# Returns routes
@app.route('/api/returns', methods=['GET'])
def get_returns():
    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT r.*, c.name as customer_name, o.order_number
        FROM returns r
        LEFT JOIN customers c ON r.customer_id = c.id
        LEFT JOIN orders o ON r.order_id = o.id
        WHERE 1=1
    '''
    params = []
    
    if status:
        query += ' AND r.status = ?'
        params.append(status)
    
    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    returns = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM returns WHERE 1=1'
    count_params = []
    
    if status:
        count_query += ' AND status = ?'
        count_params.append(status)
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'returns': [dict(r) for r in returns],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/returns', methods=['POST'])
def create_return():
    data = request.json
    order_id = data.get('order_id')
    return_type = data.get('return_type')
    items = data.get('items', [])
    
    if not order_id or not return_type or not items:
        return jsonify({'error': 'Gerekli alanlar eksik'}), 400
    
    return_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    
    # Create return record
    cursor.execute('''
        INSERT INTO returns (id, order_id, customer_id, return_type, reason, refund_amount, refund_method, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        return_id,
        order_id,
        data.get('customer_id'),
        return_type,
        data.get('reason'),
        data.get('refund_amount'),
        data.get('refund_method'),
        data.get('notes')
    ))
    
    # Create return items
    for item in items:
        return_item_id = str(uuid.uuid4())
        cursor.execute('''
            INSERT INTO return_items (id, return_id, product_id, quantity, reason, condition)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            return_item_id,
            return_id,
            item['product_id'],
            item['quantity'],
            item.get('reason'),
            item.get('condition')
        ))
        
        # Update stock if return is approved
        if return_type == 'refund':
            cursor.execute('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', 
                          (item['quantity'], item['product_id']))
    
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': return_id,
        'order_id': order_id,
        'return_type': return_type,
        'message': 'İade kaydı oluşturuldu'
    }), 201

@app.route('/api/returns/<id>', methods=['PUT'])
def update_return(id):
    data = request.json
    status = data.get('status')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE returns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', (status, id))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'İade durumu güncellendi'})

# Coupons routes
@app.route('/api/coupons', methods=['GET'])
def get_coupons():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM coupons WHERE is_active = 1 ORDER BY created_at DESC')
    coupons = cursor.fetchall()
    conn.close()
    
    return jsonify([dict(c) for c in coupons])

@app.route('/api/coupons', methods=['POST'])
def create_coupon():
    data = request.json
    code = data.get('code')
    discount_type = data.get('discount_type')
    discount_value = data.get('discount_value')
    
    if not code or not discount_type or not discount_value:
        return jsonify({'error': 'Gerekli alanlar eksik'}), 400
    
    coupon_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO coupons (id, code, discount_type, discount_value, minimum_purchase, max_discount, usage_limit, valid_from, valid_until)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        coupon_id,
        code,
        discount_type,
        discount_value,
        data.get('minimum_purchase', 0),
        data.get('max_discount'),
        data.get('usage_limit'),
        data.get('valid_from'),
        data.get('valid_until')
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': coupon_id,
        'code': code,
        'message': 'Kupon oluşturuldu'
    }), 201

@app.route('/api/coupons/<id>', methods=['PUT'])
def update_coupon(id):
    data = request.json
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE coupons SET code = ?, discount_type = ?, discount_value = ?, minimum_purchase = ?, 
        max_discount = ?, usage_limit = ?, valid_from = ?, valid_until = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('code'),
        data.get('discount_type'),
        data.get('discount_value'),
        data.get('minimum_purchase'),
        data.get('max_discount'),
        data.get('usage_limit'),
        data.get('valid_from'),
        data.get('valid_until'),
        id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Kupon güncellendi'})

@app.route('/api/coupons/<id>', methods=['DELETE'])
def delete_coupon(id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE coupons SET is_active = 0 WHERE id = ?', (id,))
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Kupon silindi'})

@app.route('/api/coupons/validate', methods=['POST'])
def validate_coupon():
    data = request.json
    code = data.get('code')
    cart_total = data.get('cart_total', 0)
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM coupons 
        WHERE code = ? AND is_active = 1 
        AND (valid_from IS NULL OR valid_from <= datetime('now'))
        AND (valid_until IS NULL OR valid_until >= datetime('now'))
        AND (usage_limit IS NULL OR used_count < usage_limit)
        AND (minimum_purchase IS NULL OR minimum_purchase <= ?)
    ''', (code, cart_total))
    coupon = cursor.fetchone()
    conn.close()
    
    if not coupon:
        return jsonify({'valid': False, 'error': 'Geçersiz veya süresi dolmuş kupon'}), 400
    
    coupon_dict = dict(coupon)
    
    # Calculate discount
    if coupon_dict['discount_type'] == 'percentage':
        discount = cart_total * (coupon_dict['discount_value'] / 100)
        if coupon_dict['max_discount']:
            discount = min(discount, coupon_dict['max_discount'])
    else:
        discount = coupon_dict['discount_value']
    
    return jsonify({
        'valid': True,
        'coupon': coupon_dict,
        'discount_amount': discount
    })

# Finance routes
@app.route('/api/finance/transactions', methods=['GET'])
def get_finance_transactions():
    transaction_type = request.args.get('transaction_type')
    category = request.args.get('category')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM finance_transactions WHERE 1=1'
    params = []
    
    if transaction_type:
        query += ' AND transaction_type = ?'
        params.append(transaction_type)
    
    if category:
        query += ' AND category = ?'
        params.append(category)
    
    query += ' ORDER BY transaction_date DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    transactions = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM finance_transactions WHERE 1=1'
    count_params = []
    
    if transaction_type:
        count_query += ' AND transaction_type = ?'
        count_params.append(transaction_type)
    
    if category:
        count_query += ' AND category = ?'
        count_params.append(category)
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'transactions': [dict(t) for t in transactions],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

@app.route('/api/finance/transactions', methods=['POST'])
def create_finance_transaction():
    data = request.json
    transaction_type = data.get('transaction_type')
    amount = data.get('amount')
    
    if not transaction_type or amount is None:
        return jsonify({'error': 'Gerekli alanlar eksik'}), 400
    
    transaction_id = str(uuid.uuid4())
    user_id = request.headers.get('X-User-ID', 'admin')
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO finance_transactions (id, transaction_type, amount, category, description, reference_id, reference_type, payment_method, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        transaction_id,
        transaction_type,
        amount,
        data.get('category'),
        data.get('description'),
        data.get('reference_id'),
        data.get('reference_type'),
        data.get('payment_method'),
        user_id
    ))
    conn.commit()
    conn.close()
    
    return jsonify({
        'id': transaction_id,
        'transaction_type': transaction_type,
        'amount': amount,
        'message': 'Finans işlemi kaydedildi'
    }), 201

@app.route('/api/finance/summary', methods=['GET'])
def get_finance_summary():
    conn = get_db()
    cursor = conn.cursor()
    
    summary = {}
    
    # Income
    cursor.execute('SELECT SUM(amount) as total FROM finance_transactions WHERE transaction_type = "income" AND status = "completed"')
    result = cursor.fetchone()
    summary['total_income'] = result['total'] or 0
    
    # Expenses
    cursor.execute('SELECT SUM(amount) as total FROM finance_transactions WHERE transaction_type = "expense" AND status = "completed"')
    result = cursor.fetchone()
    summary['total_expenses'] = result['total'] or 0
    
    # Balance
    summary['balance'] = summary['total_income'] - summary['total_expenses']
    
    # This month income
    cursor.execute('''
        SELECT SUM(amount) as total FROM finance_transactions 
        WHERE transaction_type = "income" AND status = "completed"
        AND transaction_date >= datetime('now', 'start of month')
    ''')
    result = cursor.fetchone()
    summary['month_income'] = result['total'] or 0
    
    # This month expenses
    cursor.execute('''
        SELECT SUM(amount) as total FROM finance_transactions 
        WHERE transaction_type = "expense" AND status = "completed"
        AND transaction_date >= datetime('now', 'start of month')
    ''')
    result = cursor.fetchone()
    summary['month_expenses'] = result['total'] or 0
    
    conn.close()
    
    return jsonify(summary)

# Activity logs routes
@app.route('/api/activity-logs', methods=['GET'])
def get_activity_logs():
    entity_type = request.args.get('entity_type')
    entity_id = request.args.get('entity_id')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    offset = (page - 1) * limit
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT al.*, u.username as user_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
    '''
    params = []
    
    if entity_type:
        query += ' AND al.entity_type = ?'
        params.append(entity_type)
    
    if entity_id:
        query += ' AND al.entity_id = ?'
        params.append(entity_id)
    
    query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    cursor.execute(query, params)
    logs = cursor.fetchall()
    
    # Get total count
    count_query = 'SELECT COUNT(*) as total FROM activity_logs WHERE 1=1'
    count_params = []
    
    if entity_type:
        count_query += ' AND entity_type = ?'
        count_params.append(entity_type)
    
    if entity_id:
        count_query += ' AND entity_id = ?'
        count_params.append(entity_id)
    
    cursor.execute(count_query, count_params)
    total = cursor.fetchone()['total']
    
    conn.close()
    
    return jsonify({
        'logs': [dict(l) for l in logs],
        'total': total,
        'page': page,
        'limit': limit,
        'totalPages': (total + limit - 1) // limit
    })

def log_activity(user_id, action, entity_type=None, entity_id=None, details=None):
    """Helper function to log activity"""
    conn = get_db()
    cursor = conn.cursor()
    log_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO activity_logs (id, user_id, action, entity_type, entity_id, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        log_id,
        user_id,
        action,
        entity_type,
        entity_id,
        details,
        request.remote_addr,
        request.headers.get('User-Agent', '')
    ))
    conn.commit()
    conn.close()

# Product Variations routes
@app.route('/api/products/<product_id>/variations', methods=['GET'])
def get_product_variations(product_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT pv.*, p.name as product_name 
        FROM product_variations pv
        LEFT JOIN products p ON pv.product_id = p.id
        WHERE pv.product_id = ?
        ORDER BY pv.phone_model, pv.color, pv.protection_type
    ''', (product_id,))
    variations = cursor.fetchall()
    conn.close()
    
    return jsonify({'variations': [dict(v) for v in variations]})

@app.route('/api/variations', methods=['POST'])
def create_variation():
    data = request.json
    variation_id = str(uuid.uuid4())
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO product_variations (id, product_id, phone_model, color, protection_type, price, stock_quantity, sku, barcode, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        variation_id,
        data.get('product_id'),
        data.get('phone_model'),
        data.get('color'),
        data.get('protection_type'),
        data.get('price'),
        data.get('stock_quantity', 0),
        data.get('sku'),
        data.get('barcode'),
        data.get('is_active', True)
    ))
    
    # Log activity
    log_activity(
        request.headers.get('X-User-ID', 'admin'),
        'create',
        'variation',
        variation_id,
        f'Created variation for product {data.get("product_id")}'
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({'id': variation_id, 'message': 'Varyasyon oluşturuldu'}), 201

@app.route('/api/variations/<variation_id>', methods=['PUT'])
def update_variation(variation_id):
    data = request.json
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE product_variations 
        SET phone_model = ?, color = ?, protection_type = ?, price = ?, stock_quantity = ?, 
            sku = ?, barcode = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('phone_model'),
        data.get('color'),
        data.get('protection_type'),
        data.get('price'),
        data.get('stock_quantity'),
        data.get('sku'),
        data.get('barcode'),
        data.get('is_active'),
        variation_id
    ))
    
    # Log activity
    log_activity(
        request.headers.get('X-User-ID', 'admin'),
        'update',
        'variation',
        variation_id,
        f'Updated variation'
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Varyasyon güncellendi'})

@app.route('/api/variations/<variation_id>', methods=['DELETE'])
def delete_variation(variation_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM product_variations WHERE id = ?', (variation_id,))
    
    # Log activity
    log_activity(
        request.headers.get('X-User-ID', 'admin'),
        'delete',
        'variation',
        variation_id,
        f'Deleted variation'
    )
    
    conn.commit()
    conn.close()
    
    return jsonify({'message': 'Varyasyon silindi'})

# Export route
@app.route('/api/export/orders', methods=['GET'])
def export_orders():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    format_type = request.args.get('format', 'csv')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT o.order_number, c.name as customer_name, o.status, o.subtotal, o.tax, 
        o.shipping_cost, o.discount, o.total, o.created_at
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1
    '''
    params = []
    
    if start_date:
        query += ' AND o.created_at >= ?'
        params.append(start_date)
    
    if end_date:
        query += ' AND o.created_at <= ?'
        params.append(end_date)
    
    query += ' ORDER BY o.created_at DESC'
    
    cursor.execute(query, params)
    orders = cursor.fetchall()
    conn.close()
    
    if format_type == 'excel':
        # Convert to Excel
        wb = Workbook()
        ws = wb.active
        ws.title = 'Siparişler'
        ws.append(['Sipariş No', 'Müşteri', 'Durum', 'Ara Toplam', 'Vergi', 'Kargo', 'İndirim', 'Toplam', 'Tarih'])
        for order in orders:
            ws.append([
                order['order_number'],
                order['customer_name'] or '',
                order['status'],
                order['subtotal'],
                order['tax'],
                order['shipping_cost'],
                order['discount'],
                order['total'],
                order['created_at']
            ])
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        response = app.response_class(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=siparisler.xlsx'}
        )
        
        return response
    else:
        # Convert to CSV
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Sipariş No', 'Müşteri', 'Durum', 'Ara Toplam', 'Vergi', 'Kargo', 'İndirim', 'Toplam', 'Tarih'])
        
        for order in orders:
            writer.writerow([
                order['order_number'],
                order['customer_name'] or '',
                order['status'],
                order['subtotal'],
                order['tax'],
                order['shipping_cost'],
                order['discount'],
                order['total'],
                order['created_at']
            ])
        
        response = app.response_class(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=siparisler.csv'}
        )
        
        return response

@app.route('/api/export/products', methods=['GET'])
def export_products():
    format_type = request.args.get('format', 'csv')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = '''
        SELECT p.name, p.description, p.price, p.cost_price, p.stock_quantity, 
        p.sku, p.barcode, c.name as category_name, p.is_active, p.created_at
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
    '''
    
    cursor.execute(query)
    products = cursor.fetchall()
    conn.close()
    
    if format_type == 'excel':
        wb = Workbook()
        ws = wb.active
        ws.title = 'Ürünler'
        ws.append(['Ürün Adı', 'Açıklama', 'Satış Fiyatı', 'Maliyet', 'Stok', 'SKU', 'Barkod', 'Kategori', 'Durum', 'Oluşturma Tarihi'])
        
        for product in products:
            ws.append([
                product['name'],
                product['description'] or '',
                product['price'],
                product['cost_price'] or '',
                product['stock_quantity'],
                product['sku'] or '',
                product['barcode'] or '',
                product['category_name'] or '',
                'Aktif' if product['is_active'] else 'Pasif',
                product['created_at']
            ])
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        response = app.response_class(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=urunler.xlsx'}
        )
        
        return response
    else:
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Ürün Adı', 'Açıklama', 'Satış Fiyatı', 'Maliyet', 'Stok', 'SKU', 'Barkod', 'Kategori', 'Durum', 'Oluşturma Tarihi'])
        
        for product in products:
            writer.writerow([
                product['name'],
                product['description'] or '',
                product['price'],
                product['cost_price'] or '',
                product['stock_quantity'],
                product['sku'] or '',
                product['barcode'] or '',
                product['category_name'] or '',
                'Aktif' if product['is_active'] else 'Pasif',
                product['created_at']
            ])
        
        response = app.response_class(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=urunler.csv'}
        )
        
        return response

@app.route('/api/export/customers', methods=['GET'])
def export_customers():
    format_type = request.args.get('format', 'csv')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM customers ORDER BY name'
    cursor.execute(query)
    customers = cursor.fetchall()
    conn.close()
    
    if format_type == 'excel':
        wb = Workbook()
        ws = wb.active
        ws.title = 'Müşteriler'
        ws.append(['ID', 'Ad Soyad', 'E-posta', 'Telefon', 'Adres', 'Şehir', 'Vergi No', 'Vergi Dairesi', 'Oluşturma Tarihi', 'Güncelleme Tarihi'])
        
        for customer in customers:
            ws.append([
                customer['id'],
                customer['name'],
                customer['email'] or '',
                customer['phone'] or '',
                customer['address'] or '',
                customer['city'] or '',
                customer['tax_number'] or '',
                customer['tax_office'] or '',
                customer['created_at'],
                customer['updated_at']
            ])
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        response = app.response_class(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=musteriler.xlsx'}
        )
        
        return response
    else:
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Ad Soyad', 'E-posta', 'Telefon', 'Adres', 'Şehir', 'Vergi No', 'Vergi Dairesi'])
        
        for customer in customers:
            writer.writerow([
                customer['name'],
                customer['email'] or '',
                customer['phone'] or '',
                customer['address'] or '',
                customer['city'] or '',
                customer['tax_number'] or '',
                customer['tax_office'] or ''
            ])
        
        response = app.response_class(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=musteriler.csv'}
        )
        
        return response

@app.route('/api/export/finance', methods=['GET'])
def export_finance():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    format_type = request.args.get('format', 'csv')
    
    conn = get_db()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM finance_transactions WHERE 1=1'
    params = []
    
    if start_date:
        query += ' AND transaction_date >= ?'
        params.append(start_date)
    
    if end_date:
        query += ' AND transaction_date <= ?'
        params.append(end_date)
    
    query += ' ORDER BY transaction_date DESC'
    
    cursor.execute(query, params)
    transactions = cursor.fetchall()
    conn.close()
    
    if format_type == 'excel':
        wb = Workbook()
        ws = wb.active
        ws.title = 'Finans'
        ws.append(['ID', 'Tür', 'Tutar', 'Tarih', 'Kategori', 'Açıklama', 'Referans ID', 'Referans Tür', 'Ödeme Yöntemi', 'Durum', 'Oluşturma Tarihi'])
        
        for t in transactions:
            ws.append([
                t['id'],
                t['transaction_type'],
                t['amount'],
                t['transaction_date'],
                t['category'] or '',
                t['description'] or '',
                t['reference_id'] or '',
                t['reference_type'] or '',
                t['payment_method'] or '',
                t['status'],
                t['created_at']
            ])
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        response = app.response_class(
            output.getvalue(),
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': 'attachment; filename=finans.xlsx'}
        )
        
        return response
    else:
        import csv
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Tür', 'Tutar', 'Tarih', 'Kategori', 'Açıklama', 'Ödeme Yöntemi', 'Durum'])
        
        for transaction in transactions:
            writer.writerow([
                transaction['transaction_type'],
                transaction['amount'],
                transaction['transaction_date'],
                transaction['category'] or '',
                transaction['description'] or '',
                transaction['payment_method'] or '',
                transaction['status']
            ])
        
        response = app.response_class(
            output.getvalue(),
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment; filename=finans.csv'}
        )
        
        return response

# PDF Report routes
@app.route('/api/pdf/invoice/<order_id>', methods=['GET'])
def generate_invoice_pdf(order_id):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT o.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, 
               c.address as customer_address, c.city as customer_city
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.id = ?
    ''', (order_id,))
    order = cursor.fetchone()
    
    if not order:
        conn.close()
        return jsonify({'error': 'Sipariş bulunamadı'}), 404
    
    cursor.execute('''
        SELECT oi.*, p.name as product_name
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = ?
    ''', (order_id,))
    items = cursor.fetchall()
    
    cursor.execute('SELECT * FROM settings WHERE key = "company_name"')
    company_name = cursor.fetchone()
    cursor.execute('SELECT * FROM settings WHERE key = "address"')
    company_address = cursor.fetchone()
    cursor.execute('SELECT * FROM settings WHERE key = "phone"')
    company_phone = cursor.fetchone()
    
    conn.close()
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=30
    )
    story.append(Paragraph('FATURA', title_style))
    story.append(Spacer(1, 0.2 * inch))
    
    # Company info
    company_info = f"""
    <b>{company_name['value'] if company_name else 'Şirket'}</b><br/>
    {company_address['value'] if company_address else ''}<br/>
    Tel: {company_phone['value'] if company_phone else ''}
    """
    story.append(Paragraph(company_info, styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))
    
    # Customer info
    customer_info = f"""
    <b>Müşteri:</b> {order['customer_name'] or '-'}<br/>
    <b>Telefon:</b> {order['customer_phone'] or '-'}<br/>
    <b>Adres:</b> {order['customer_address'] or ''} {order['customer_city'] or ''}
    """
    story.append(Paragraph(customer_info, styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))
    
    # Order info
    order_info = f"""
    <b>Sipariş No:</b> {order['order_number']}<br/>
    <b>Tarih:</b> {order['created_at']}<br/>
    <b>Durum:</b> {order['status']}
    """
    story.append(Paragraph(order_info, styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))
    
    # Items table
    table_data = [['Ürün', 'Miktar', 'Birim Fiyat', 'Toplam']]
    for item in items:
        table_data.append([
            item['product_name'] or '-',
            str(item['quantity']),
            f"₺{item['unit_price']:.2f}",
            f"₺{item['total_price']:.2f}"
        ])
    
    table = Table(table_data, colWidths=[3*inch, 1*inch, 1*inch, 1*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.3 * inch))
    
    # Totals
    totals = f"""
    <b>Ara Toplam:</b> ₺{order['subtotal']:.2f}<br/>
    <b>Vergi:</b> ₺{order['tax']:.2f}<br/>
    <b>Kargo:</b> ₺{order['shipping_cost']:.2f}<br/>
    <b>İndirim:</b> ₺{order['discount']:.2f}<br/>
    <b>TOPLAM:</b> ₺{order['total']:.2f}
    """
    story.append(Paragraph(totals, styles['Normal']))
    
    doc.build(story)
    buffer.seek(0)
    
    response = app.response_class(
        buffer.getvalue(),
        mimetype='application/pdf',
        headers={'Content-Disposition': f'attachment; filename=fatura_{order["order_number"]}.pdf'}
    )
    
    return response

@app.route('/api/pdf/stock-report', methods=['GET'])
def generate_stock_report_pdf():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT p.name, p.sku, p.stock_quantity, p.price, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.name
    ''')
    products = cursor.fetchall()
    conn.close()
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e40af'),
        spaceAfter=30
    )
    story.append(Paragraph('STOK RAPORU', title_style))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(f'Oluşturma Tarihi: {datetime.now().strftime("%d/%m/%Y %H:%M")}', styles['Normal']))
    story.append(Spacer(1, 0.3 * inch))
    
    table_data = [['Ürün', 'SKU', 'Stok', 'Fiyat', 'Kategori']]
    for product in products:
        table_data.append([
            product['name'],
            product['sku'] or '-',
            str(product['stock_quantity']),
            f"₺{product['price']:.2f}",
            product['category_name'] or '-'
        ])
    
    table = Table(table_data, colWidths=[3*inch, 1*inch, 1*inch, 1*inch, 1.5*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e40af')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)
    
    doc.build(story)
    buffer.seek(0)
    
    response = app.response_class(
        buffer.getvalue(),
        mimetype='application/pdf',
        headers={'Content-Disposition': 'attachment; filename=stok_raporu.pdf'}
    )
    
    return response

# Initialize database at startup
init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
