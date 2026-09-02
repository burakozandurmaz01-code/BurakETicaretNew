import app
import json

client = app.app.test_client()

# Login
r = client.post('/api/auth/login', json={'username': 'admin', 'password': 'EnnerVal1453'})
assert r.status_code == 200, r.get_json()
token = r.get_json()['token']
headers = {'Authorization': 'Bearer ' + token}
print('OK: login')

# Dashboard stats
r = client.get('/api/dashboard/stats', headers=headers)
assert r.status_code == 200, r.get_json()
stats = r.get_json()
assert 'total_products' in stats
print('OK: dashboard/stats', stats.get('total_products'), 'products')

# List products
r = client.get('/api/products?limit=5&search=', headers=headers)
assert r.status_code == 200, r.get_json()
products = r.get_json()['products']
print('OK: products', len(products), 'items')

# Create a product with auto SKU
r = client.post('/api/products', json={
    'name': 'Test Telefon Kılıfı',
    'price': 149.90,
    'cost_price': 90.0,
    'stock_quantity': 50,
    'low_stock_threshold': 10,
    'packaging_cost': 2.0,
    'commission': 3.0,
    'other_costs': 1.0,
    'is_active': True
}, headers=headers)
assert r.status_code == 201, r.get_json()
product = r.get_json()
product_id = product['id']
print('OK: create product SKU=', product.get('sku'), 'profit=', product.get('profit'))

# Update product stock
r = client.put(f'/api/products/{product_id}', json={'stock_quantity': 45}, headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: update product stock')

# Stock movements
r = client.get('/api/stock-movements?limit=5', headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: stock movements', r.get_json().get('total'), 'total')

# Customers
r = client.get('/api/customers?limit=5', headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: customers', len(r.get_json()), 'items')

# Orders
r = client.get('/api/orders?limit=5', headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: orders', r.get_json().get('total'), 'total')

# Backup export
r = client.get('/api/backup', headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: backup', list(r.get_json().get('tables', {}).keys()))

# Delete product (soft)
r = client.delete(f'/api/products/{product_id}', headers=headers)
assert r.status_code == 200, r.get_json()
print('OK: delete product')

print('E2E test passed')
