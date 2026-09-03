// API Configuration
const API_BASE_URL = window.location.origin + '/api';

function resolveUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return window.location.origin + (url.startsWith('/') ? url : '/' + url);
}

// State Management
let currentUser = null;
let authToken = null;
let currentTheme = 'light';
let salesChart = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const applyScreen = document.getElementById('apply-screen');
const onboardingScreen = document.getElementById('onboarding-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const modalOverlay = document.getElementById('modal-overlay');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    try { checkAuth(); } catch (e) { console.error('checkAuth hatası:', e); }
    try { updateDashboardStats(); } catch (e) { console.error('updateDashboardStats hatası:', e); }
    try { initializeEventListeners(); } catch (e) { console.error('initializeEventListeners hatası:', e); }
});

// Authentication
function checkAuth() {
    authToken = localStorage.getItem('authToken');
    currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

    if (authToken && currentUser) {
        if (currentUser.force_password_change) {
            showOnboardingScreen('password');
        } else if (!currentUser.business_info_completed) {
            showOnboardingScreen('business');
        } else {
            showMainApp();
            loadDashboard();
        }
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    loginScreen.classList.remove('hidden');
    applyScreen.classList.add('hidden');
    onboardingScreen.classList.add('hidden');
    mainApp.classList.add('hidden');
}

function showApplyScreen() {
    loginScreen.classList.add('hidden');
    applyScreen.classList.remove('hidden');
    onboardingScreen.classList.add('hidden');
    mainApp.classList.add('hidden');
}

function showOnboardingScreen(step) {
    loginScreen.classList.add('hidden');
    applyScreen.classList.add('hidden');
    onboardingScreen.classList.remove('hidden');
    mainApp.classList.add('hidden');
    document.getElementById('onboarding-step-1').style.display = step === 'password' ? 'block' : 'none';
    document.getElementById('onboarding-step-2').style.display = step === 'business' ? 'block' : 'none';
    if (step === 'business') loadBusinessProfileForOnboarding();
}

function showMainApp() {
    loginScreen.classList.add('hidden');
    applyScreen.classList.add('hidden');
    onboardingScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    applyTheme(currentUser.theme || 'light');
    updateSidebarForRole();
}

async function login(username, password, remember_me = false) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            if (remember_me) {
                localStorage.setItem('rememberedUsername', username);
            } else {
                localStorage.removeItem('rememberedUsername');
            }
            if (currentUser.force_password_change) {
                showOnboardingScreen('password');
                showToast('Geçici şifre ile giriş yaptınız. Lütfen yeni şifre belirleyin.', 'info');
            } else if (!currentUser.business_info_completed) {
                showOnboardingScreen('business');
                showToast('Lütfen işletme bilgilerinizi tamamlayın.', 'info');
            } else {
                showMainApp();
                loadDashboard();
                showToast('Giriş başarılı', 'success');
            }
        } else {
            showToast(data.error || 'Giriş başarısız', 'error');
        }
    } catch (error) {
        showToast('Sunucu hatası', 'error');
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    showLoginScreen();
    showToast('Çıkış yapıldı', 'info');
}

// Theme Management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    currentTheme = savedTheme;
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
}

async function changeTheme(theme) {
    try {
        const response = await fetch(`${API_BASE_URL}/users/theme`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ theme })
        });

        if (response.ok) {
            applyTheme(theme);
            if (currentUser) {
                currentUser.theme = theme;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
            }
            showToast('Tema değiştirildi', 'success');
        }
    } catch (error) {
        showToast('Tema değiştirme hatası', 'error');
    }
}

// API Helper
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        'X-User-ID': currentUser?.id || 'admin',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    const data = await response.json();

    if (!response.ok) {
        if (response.status === 401) {
            alert(data.error || 'Oturum süresi doldu. Lütfen tekrar giriş yapın.');
            logout();
        }
        throw new Error(data.error || 'API hatası');
    }

    return data;
}

// Dashboard
async function loadDashboard() {
    try {
        const stats = await apiRequest('/dashboard/stats');
        updateDashboardStats(stats);

        const recentOrders = await apiRequest('/dashboard/recent-orders');
        updateRecentOrdersTable(recentOrders);

        const salesData = await apiRequest('/dashboard/sales-chart?days=30');
        updateSalesChart(salesData);
    } catch (error) {
        console.error('Dashboard yüklenirken hata:', error);
    }
}

function updateDashboardStats(stats) {
    document.getElementById('total-products').textContent = stats.total_products || 0;
    document.getElementById('total-customers').textContent = stats.total_customers || 0;
    document.getElementById('total-orders').textContent = stats.total_orders || 0;
    document.getElementById('total-revenue').textContent = `₺${(stats.total_revenue || 0).toFixed(2)}`;
    document.getElementById('net-profit').textContent = `₺${(stats.net_profit || 0).toFixed(2)}`;
    document.getElementById('stock-value').textContent = `₺${(stats.stock_value || 0).toFixed(2)}`;
    document.getElementById('pending-orders').textContent = stats.pending_orders || 0;
    document.getElementById('low-stock').textContent = stats.low_stock_count || 0;
    document.getElementById('out-of-stock').textContent = stats.out_of_stock || 0;
}

function updateRecentOrdersTable(orders) {
    const tbody = document.getElementById('recent-orders-table');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Sipariş bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.order_number}</td>
            <td>${order.customer_name || '-'}</td>
            <td>₺${order.total.toFixed(2)}</td>
            <td><span class="badge badge-${getStatusBadgeClass(order.status)}">${getStatusLabel(order.status)}</span></td>
            <td>${formatDate(order.created_at)}</td>
        </tr>
    `).join('');
}

function updateSalesChart(salesData) {
    const ctx = document.getElementById('sales-chart').getContext('2d');
    
    if (salesChart) {
        salesChart.destroy();
    }

    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: salesData.map(s => formatDate(s.date)),
            datasets: [{
                label: 'Satış (₺)',
                data: salesData.map(s => s.total || 0),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Products
async function loadProducts(page = 1, search = '') {
    try {
        const data = await apiRequest(`/products?page=${page}&search=${encodeURIComponent(search)}`);
        updateProductsTable(data.products);
        updatePagination('products-pagination', data.page, data.totalPages, loadProducts);
    } catch (error) {
        console.error('Ürünler yüklenirken hata:', error);
    }
}

function updateProductsTable(products) {
    const tbody = document.getElementById('products-table');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Ürün bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => {
        let stockBadgeClass = 'success';
        let stockLabel = 'Yeterli';
        if (product.is_out_of_stock) {
            stockBadgeClass = 'danger';
            stockLabel = 'Tükendi';
        } else if (product.is_low_stock) {
            stockBadgeClass = 'warning';
            stockLabel = 'Düşük';
        }

        return `
        <tr>
            <td>${product.image_url ? `<img src="${resolveUrl(product.image_url)}" alt="${product.name}">` : '<div class="no-image">-</div>'}</td>
            <td>${product.name}</td>
            <td>${product.sku || '-'}</td>
            <td>${product.category_name || '-'}</td>
            <td>₺${product.price.toFixed(2)}</td>
            <td>₺${(product.cost_price || 0).toFixed(2)}</td>
            <td>₺${(product.profit || 0).toFixed(2)}</td>
            <td>${product.stock_quantity} <span class="badge badge-${stockBadgeClass}">${stockLabel}</span></td>
            <td><span class="badge badge-${product.is_active ? 'success' : 'secondary'}">${product.is_active ? 'Aktif' : 'Pasif'}</span></td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editProduct('${product.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="deleteProduct('${product.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

async function saveProduct(formData) {
    try {
        const productId = document.getElementById('product-id').value;
        const url = productId ? `/products/${productId}` : '/products';
        const method = productId ? 'PUT' : 'POST';

        const price = parseFloat(formData.get('price'));
        const stock = parseInt(formData.get('stock_quantity'));

        if (!formData.get('name')) {
            showToast('Ürün adı zorunludur', 'error');
            return;
        }
        if (isNaN(price) || price < 0) {
            showToast('Fiyat geçerli bir pozitif sayı olmalıdır', 'error');
            return;
        }
        if (isNaN(stock) || stock < 0) {
            showToast('Stok miktarı geçerli bir tam sayı olmalıdır', 'error');
            return;
        }

        const productData = {
            name: formData.get('name'),
            description: formData.get('description'),
            price: price,
            cost_price: formData.get('cost_price') ? parseFloat(formData.get('cost_price')) : 0,
            stock_quantity: stock,
            low_stock_threshold: formData.get('low_stock_threshold') ? parseInt(formData.get('low_stock_threshold')) : 10,
            packaging_cost: formData.get('packaging_cost') ? parseFloat(formData.get('packaging_cost')) : 0,
            commission: formData.get('commission') ? parseFloat(formData.get('commission')) : 0,
            other_costs: formData.get('other_costs') ? parseFloat(formData.get('other_costs')) : 0,
            category_id: formData.get('category_id') || null,
            sku: formData.get('sku') || null,
            barcode: formData.get('barcode') || null,
            is_active: document.getElementById('product-active').checked
        };

        const data = await apiRequest(url, {
            method,
            body: JSON.stringify(productData)
        });

        if (data) {
            // Save variations if this is a new product
            if (!productId) {
                const variations = collectVariations(data.id);
                if (variations.length > 0) {
                    await saveProductVariations(data.id, variations);
                }
            }

            closeModal();
            loadProducts();
            showToast(productId ? 'Ürün güncellendi' : 'Ürün oluşturuldu', 'success');
        } else {
            showToast(data.error || 'İşlem hatası', 'error');
        }
    } catch (error) {
        showToast('Sunucu hatası', 'error');
    }
}

async function editProduct(productId) {
    try {
        const product = await apiRequest(`/products/${productId}`);

        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-description').value = product.description || '';
        document.getElementById('product-price').value = product.price;
        document.getElementById('product-cost').value = product.cost_price || '';
        document.getElementById('product-stock').value = product.stock_quantity;
        document.getElementById('product-low-stock').value = product.low_stock_threshold || 10;
        document.getElementById('product-packaging').value = product.packaging_cost || '';
        document.getElementById('product-commission').value = product.commission || '';
        document.getElementById('product-other-costs').value = product.other_costs || '';
        document.getElementById('product-category').value = product.category_id || '';
        document.getElementById('product-sku').value = product.sku || '';
        document.getElementById('product-barcode').value = product.barcode || '';
        document.getElementById('product-active').checked = product.is_active;

        document.getElementById('product-modal-title').textContent = 'Ürün Düzenle';
        openModal('product-modal');

        await loadCategories();
    } catch (error) {
        showToast('Ürün yüklenirken hata', 'error');
    }
}

async function deleteProduct(productId) {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/products/${productId}`, { method: 'DELETE' });
        loadProducts();
        showToast('Ürün silindi', 'success');
    } catch (error) {
        showToast('Ürün silme hatası', 'error');
    }
}

// Categories
async function loadCategories() {
    try {
        const categories = await apiRequest('/categories');
        updateCategoriesTable(categories);
        updateCategorySelects(categories);
    } catch (error) {
        console.error('Kategoriler yüklenirken hata:', error);
    }
}

function updateCategoriesTable(categories) {
    const tbody = document.getElementById('categories-table');
    
    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Kategori bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = categories.map(category => `
        <tr>
            <td>${category.name}</td>
            <td>${category.description || '-'}</td>
            <td>-</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editCategory('${category.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="deleteCategory('${category.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateCategorySelects(categories) {
    const selects = [
        document.getElementById('product-category'),
        document.getElementById('category-parent')
    ];

    selects.forEach(select => {
        if (!select) return;
        
        const currentValue = select.value;
        select.innerHTML = '<option value="">Seçiniz</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });

        select.value = currentValue;
    });
}

async function saveCategory(formData) {
    try {
        const categoryId = document.getElementById('category-id').value;
        const url = categoryId ? `/categories/${categoryId}` : '/categories';
        const method = categoryId ? 'PUT' : 'POST';

        const categoryData = {
            name: formData.get('name'),
            description: formData.get('description'),
            parent_id: formData.get('parent_id') || null
        };

        await apiRequest(url, {
            method,
            body: JSON.stringify(categoryData)
        });

        closeModal();
        loadCategories();
        showToast(categoryId ? 'Kategori güncellendi' : 'Kategori oluşturuldu', 'success');
    } catch (error) {
        console.error('Kategori kaydedilirken hata:', error);
        showToast(error.message || 'İşlem hatası', 'error');
    }
}

async function editCategory(categoryId) {
    try {
        const category = await apiRequest(`/categories/${categoryId}`);
        
        document.getElementById('category-id').value = category.id;
        document.getElementById('category-name').value = category.name;
        document.getElementById('category-description').value = category.description || '';
        document.getElementById('category-parent').value = category.parent_id || '';

        document.getElementById('category-modal-title').textContent = 'Kategori Düzenle';
        openModal('category-modal');
    } catch (error) {
        showToast('Kategori yüklenirken hata', 'error');
    }
}

async function deleteCategory(categoryId) {
    if (!confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/categories/${categoryId}`, { method: 'DELETE' });
        loadCategories();
        showToast('Kategori silindi', 'success');
    } catch (error) {
        showToast('Kategori silme hatası', 'error');
    }
}

// Orders
async function loadOrders(page = 1, status = '', search = '') {
    try {
        const params = new URLSearchParams({ page, status, search });
        const data = await apiRequest(`/orders?${params}`);
        updateOrdersTable(data.orders);
        updatePagination('orders-pagination', data.page, data.totalPages, loadOrders);
    } catch (error) {
        console.error('Siparişler yüklenirken hata:', error);
    }
}

function updateOrdersTable(orders) {
    const tbody = document.getElementById('orders-table');
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sipariş bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>${order.order_number}</td>
            <td>${order.customer_name || '-'}</td>
            <td>₺${order.total.toFixed(2)}</td>
            <td><span class="badge badge-${getStatusBadgeClass(order.status)}">${getStatusLabel(order.status)}</span></td>
            <td>${formatDate(order.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="viewOrderDetail('${order.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="editOrder('${order.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="deleteOrder('${order.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function saveOrder(formData) {
    try {
        const orderId = document.getElementById('order-id').value;
        
        // Collect order items
        const orderItems = [];
        document.querySelectorAll('.order-item').forEach(item => {
            const productId = item.querySelector('.item-product').value;
            const quantity = parseInt(item.querySelector('.item-quantity').value);
            const unitPrice = parseFloat(item.querySelector('.item-price').value);

            if (productId && quantity > 0 && unitPrice > 0) {
                orderItems.push({
                    product_id: productId,
                    quantity,
                    unit_price: unitPrice
                });
            }
        });

        if (orderItems.length === 0) {
            showToast('En az bir ürün ekleyin', 'error');
            return;
        }

        const orderData = {
            customer_id: formData.get('customer_id'),
            items: orderItems,
            tax: parseFloat(formData.get('tax')) || 0,
            shipping_cost: parseFloat(formData.get('shipping_cost')) || 0,
            discount: parseFloat(formData.get('discount')) || 0,
            notes: formData.get('notes') || ''
        };

        await apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });

        closeModal();
        loadOrders();
        showToast('Sipariş oluşturuldu', 'success');
    } catch (error) {
        showToast('İşlem hatası', 'error');
    }
}

async function viewOrderDetail(orderId) {
    try {
        const order = await apiRequest(`/orders/${orderId}`);

        // Store order ID for PDF generation
        document.getElementById('print-invoice-btn').dataset.orderId = orderId;

        const content = `
            <div class="order-detail-info">
                <div><strong>Sipariş No:</strong> ${order.order_number}</div>
                <div><strong>Müşteri:</strong> ${order.customer_name || '-'}</div>
                <div><strong>Durum:</strong> ${getStatusLabel(order.status)}</div>
                <div><strong>Kargo Durumu:</strong> ${order.shipping_status || 'Bekliyor'}</div>
                <div><strong>Tarih:</strong> ${formatDate(order.created_at)}</div>
                <div><strong>Ara Toplam:</strong> ₺${order.subtotal.toFixed(2)}</div>
                <div><strong>Vergi:</strong> ₺${order.tax.toFixed(2)}</div>
                <div><strong>Kargo:</strong> ₺${order.shipping_cost.toFixed(2)}</div>
                <div><strong>İndirim:</strong> ₺${order.discount.toFixed(2)}</div>
                <div><strong>Toplam:</strong> ₺${order.total.toFixed(2)}</div>
                <div><strong>Tahmini Kar:</strong> ₺${(order.profit || 0).toFixed(2)}</div>
                <div><strong>Notlar:</strong> ${order.notes || '-'}</div>
            </div>
            <div class="order-status-update" style="margin: 15px 0; padding: 15px; border: 1px solid var(--border-color); border-radius: 4px;">
                <label><strong>Sipariş / Kargo Durumunu Güncelle</strong></label>
                <div class="form-row" style="margin-top: 8px;">
                    <div class="form-group">
                        <label>Sipariş Durumu</label>
                        <select id="order-detail-status" class="form-control">
                            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Bekliyor</option>
                            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>İşleniyor</option>
                            <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Kargolandı</option>
                            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Teslim Edildi</option>
                            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>İptal Edildi</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Kargo Durumu</label>
                        <select id="order-detail-shipping-status" class="form-control">
                            <option value="pending" ${order.shipping_status === 'pending' ? 'selected' : ''}>Bekliyor</option>
                            <option value="shipped" ${order.shipping_status === 'shipped' ? 'selected' : ''}>Kargolandı</option>
                            <option value="in_transit" ${order.shipping_status === 'in_transit' ? 'selected' : ''}>Dağıtımda</option>
                            <option value="delivered" ${order.shipping_status === 'delivered' ? 'selected' : ''}>Teslim Edildi</option>
                            <option value="returned" ${order.shipping_status === 'returned' ? 'selected' : ''}>İade</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Kargo Firması</label>
                        <input type="text" id="order-detail-shipping-company" class="form-control" value="${order.shipping_company || ''}">
                    </div>
                    <div class="form-group">
                        <label>Takip Numarası</label>
                        <input type="text" id="order-detail-tracking-number" class="form-control" value="${order.tracking_number || ''}">
                    </div>
                </div>
                <button type="button" class="btn btn-primary" id="update-order-status-btn">
                    <i class="fas fa-save"></i> Kaydet
                </button>
            </div>
            <h4>Sipariş Ürünleri</h4>
            <table class="table">
                <thead>
                    <tr>
                        <th>Ürün</th>
                        <th>Miktar</th>
                        <th>Birim Fiyat</th>
                        <th>Toplam</th>
                    </tr>
                </thead>
                <tbody>
                    ${order.items.map(item => `
                        <tr>
                            <td>${item.product_name || '-'} <small>${item.product_sku || ''}</small></td>
                            <td>${item.quantity}</td>
                            <td>₺${item.unit_price.toFixed(2)}</td>
                            <td>₺${item.total_price.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        document.getElementById('order-detail-content').innerHTML = content;

        document.getElementById('update-order-status-btn').addEventListener('click', () => {
            const status = document.getElementById('order-detail-status').value;
            const shippingStatus = document.getElementById('order-detail-shipping-status').value;
            const shippingCompany = document.getElementById('order-detail-shipping-company').value;
            const trackingNumber = document.getElementById('order-detail-tracking-number').value;
            updateOrderStatus(orderId, { status, shipping_status: shippingStatus, shipping_company: shippingCompany, tracking_number: trackingNumber });
        });

        openModal('order-detail-modal');
    } catch (error) {
        showToast('Sipariş detayı yüklenirken hata', 'error');
    }
}

async function updateOrderStatus(orderId, payload) {
    try {
        await apiRequest(`/orders/${orderId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        showToast('Sipariş güncellendi', 'success');
        loadOrders();
        closeModal();
    } catch (error) {
        showToast('Sipariş güncellenirken hata', 'error');
    }
}

async function editOrder(orderId) {
    try {
        const order = await apiRequest(`/orders/${orderId}`);
        
        document.getElementById('order-id').value = order.id;
        document.getElementById('order-customer').value = order.customer_id || '';
        document.getElementById('order-tax').value = order.tax || 0;
        document.getElementById('order-shipping').value = order.shipping_cost || 0;
        document.getElementById('order-discount').value = order.discount || 0;
        document.getElementById('order-notes').value = order.notes || '';

        // Load order items
        const orderItemsContainer = document.getElementById('order-items');
        orderItemsContainer.innerHTML = '';
        
        order.items.forEach(item => {
            addOrderItem(item.product_id, item.quantity, item.unit_price);
        });

        document.getElementById('order-modal-title').textContent = 'Sipariş Düzenle';
        openModal('order-modal');
        
        await loadCustomers();
        await loadProductsForSelect();
    } catch (error) {
        showToast('Sipariş yüklenirken hata', 'error');
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Bu siparişi silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/orders/${orderId}`, { method: 'DELETE' });
        loadOrders();
        showToast('Sipariş silindi', 'success');
    } catch (error) {
        showToast('Sipariş silme hatası', 'error');
    }
}

// Customers
async function loadCustomers(search = '') {
    try {
        const customers = await apiRequest(`/customers?search=${encodeURIComponent(search)}`);
        updateCustomersTable(customers);
    } catch (error) {
        console.error('Müşteriler yüklenirken hata:', error);
    }
}

function updateCustomersTable(customers) {
    const tbody = document.getElementById('customers-table');
    
    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Müşteri bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(customer => `
        <tr>
            <td>${customer.name}</td>
            <td>${customer.email || '-'}</td>
            <td>${customer.phone || '-'}</td>
            <td>${customer.city || '-'}</td>
            <td>${customer.tax_number || '-'}</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editCustomer('${customer.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="deleteCustomer('${customer.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function saveCustomer(formData) {
    try {
        const customerId = document.getElementById('customer-id').value;
        const url = customerId ? `/customers/${customerId}` : '/customers';
        const method = customerId ? 'PUT' : 'POST';

        const customerData = {
            name: formData.get('name'),
            email: formData.get('email') || null,
            phone: formData.get('phone') || null,
            address: formData.get('address') || null,
            city: formData.get('city') || null,
            tax_number: formData.get('tax_number') || null,
            tax_office: formData.get('tax_office') || null
        };

        await apiRequest(url, {
            method,
            body: JSON.stringify(customerData)
        });

        closeModal();
        loadCustomers();
        showToast(customerId ? 'Müşteri güncellendi' : 'Müşteri oluşturuldu', 'success');
    } catch (error) {
        console.error('Müşteri kaydedilirken hata:', error);
        showToast(error.message || 'İşlem hatası', 'error');
    }
}

async function editCustomer(customerId) {
    try {
        const customer = await apiRequest(`/customers/${customerId}`);
        
        document.getElementById('customer-id').value = customer.id;
        document.getElementById('customer-name').value = customer.name;
        document.getElementById('customer-email').value = customer.email || '';
        document.getElementById('customer-phone').value = customer.phone || '';
        document.getElementById('customer-address').value = customer.address || '';
        document.getElementById('customer-city').value = customer.city || '';
        document.getElementById('customer-tax-no').value = customer.tax_number || '';
        document.getElementById('customer-tax-office').value = customer.tax_office || '';

        document.getElementById('customer-modal-title').textContent = 'Müşteri Düzenle';
        openModal('customer-modal');
    } catch (error) {
        showToast('Müşteri yüklenirken hata', 'error');
    }
}

async function deleteCustomer(customerId) {
    if (!confirm('Bu müşteriyi silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/customers/${customerId}`, { method: 'DELETE' });
        loadCustomers();
        showToast('Müşteri silindi', 'success');
    } catch (error) {
        showToast('Müşteri silme hatası', 'error');
    }
}

// Stock Movements
async function loadStockMovements(page = 1, movementType = '') {
    try {
        const params = new URLSearchParams({ page, movement_type: movementType });
        const data = await apiRequest(`/stock-movements?${params}`);
        updateStockMovementsTable(data.movements);
        updatePagination('stock-pagination', data.page, data.totalPages, loadStockMovements);
    } catch (error) {
        console.error('Stok hareketleri yüklenirken hata:', error);
    }
}

function updateStockMovementsTable(movements) {
    const tbody = document.getElementById('stock-movements-table');
    
    if (movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Stok hareketi bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = movements.map(movement => `
        <tr>
            <td>${movement.product_name || '-'}</td>
            <td><span class="badge badge-${movement.movement_type === 'in' ? 'success' : movement.movement_type === 'out' ? 'danger' : 'warning'}">${movement.movement_type === 'in' ? 'Giriş' : movement.movement_type === 'out' ? 'Çıkış' : 'Düzeltme'}</span></td>
            <td>${movement.quantity}</td>
            <td>${movement.reference_id || '-'}</td>
            <td>${movement.notes || '-'}</td>
            <td>${formatDate(movement.created_at)}</td>
            <td>${movement.created_by_name || '-'}</td>
        </tr>
    `).join('');
}

// Suppliers
async function loadSuppliers(search = '') {
    try {
        const suppliers = await apiRequest(`/suppliers?search=${encodeURIComponent(search)}`);
        updateSuppliersTable(suppliers);
    } catch (error) {
        console.error('Tedarikçiler yüklenirken hata:', error);
    }
}

function updateSuppliersTable(suppliers) {
    const tbody = document.getElementById('suppliers-table');
    
    if (suppliers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">Tedarikçi bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = suppliers.map(supplier => `
        <tr>
            <td>${supplier.name}</td>
            <td>${supplier.contact_person || '-'}</td>
            <td>${supplier.email || '-'}</td>
            <td>${supplier.phone || '-'}</td>
            <td>${supplier.city || '-'}</td>
            <td>${supplier.tax_number || '-'}</td>
            <td>${supplier.payment_terms || '-'}</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="editSupplier('${supplier.id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="deleteSupplier('${supplier.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function openStockMovementModal() {
    try {
        const data = await apiRequest('/products?limit=1000');
        const select = document.getElementById('stock-movement-product');
        select.innerHTML = '<option value="">Seçiniz</option>';
        data.products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ürünler yüklenirken hata:', error);
    }
    document.getElementById('stock-movement-form').reset();
    document.getElementById('stock-movement-id').value = '';
    document.getElementById('stock-movement-modal-title').textContent = 'Stok Hareketi Ekle';
    openModal('stock-movement-modal');
}

async function saveStockMovement(formData) {
    try {
        const movementData = {
            product_id: formData.get('product_id'),
            movement_type: formData.get('movement_type'),
            quantity: parseInt(formData.get('quantity')) || 0,
            notes: formData.get('notes') || null
        };

        if (!movementData.product_id) {
            showToast('Ürün seçmelisiniz', 'error');
            return;
        }
        if (movementData.quantity === 0) {
            showToast('Miktar 0 olamaz', 'error');
            return;
        }

        await apiRequest('/stock-movements', {
            method: 'POST',
            body: JSON.stringify(movementData)
        });

        closeModal();
        loadStockMovements();
        showToast('Stok hareketi kaydedildi', 'success');
    } catch (error) {
        console.error('Stok hareketi kaydedilirken hata:', error);
        showToast(error.message || 'İşlem hatası', 'error');
    }
}

async function openSupplierModal() {
    document.getElementById('supplier-form').reset();
    document.getElementById('supplier-id').value = '';
    document.getElementById('supplier-modal-title').textContent = 'Yeni Tedarikçi';
    openModal('supplier-modal');
}

async function saveSupplier(formData) {
    try {
        const supplierId = document.getElementById('supplier-id').value;
        const url = supplierId ? `/suppliers/${supplierId}` : '/suppliers';
        const method = supplierId ? 'PUT' : 'POST';

        const supplierData = {
            name: formData.get('name'),
            contact_person: formData.get('contact_person') || null,
            email: formData.get('email') || null,
            phone: formData.get('phone') || null,
            address: formData.get('address') || null,
            city: formData.get('city') || null,
            tax_number: formData.get('tax_number') || null,
            tax_office: formData.get('tax_office') || null,
            payment_terms: formData.get('payment_terms') || null,
            notes: formData.get('notes') || null
        };

        if (!supplierData.name) {
            showToast('Firma adı zorunludur', 'error');
            return;
        }

        await apiRequest(url, {
            method,
            body: JSON.stringify(supplierData)
        });

        closeModal();
        loadSuppliers();
        showToast(supplierId ? 'Tedarikçi güncellendi' : 'Tedarikçi oluşturuldu', 'success');
    } catch (error) {
        console.error('Tedarikçi kaydedilirken hata:', error);
        showToast(error.message || 'İşlem hatası', 'error');
    }
}

async function editSupplier(supplierId) {
    try {
        const supplier = await apiRequest(`/suppliers/${supplierId}`);
        document.getElementById('supplier-id').value = supplier.id;
        document.getElementById('supplier-name').value = supplier.name || '';
        document.getElementById('supplier-contact-person').value = supplier.contact_person || '';
        document.getElementById('supplier-email').value = supplier.email || '';
        document.getElementById('supplier-phone').value = supplier.phone || '';
        document.getElementById('supplier-address').value = supplier.address || '';
        document.getElementById('supplier-city').value = supplier.city || '';
        document.getElementById('supplier-tax-number').value = supplier.tax_number || '';
        document.getElementById('supplier-tax-office').value = supplier.tax_office || '';
        document.getElementById('supplier-payment-terms').value = supplier.payment_terms || '';
        document.getElementById('supplier-notes').value = supplier.notes || '';
        document.getElementById('supplier-modal-title').textContent = 'Tedarikçi Düzenle';
        openModal('supplier-modal');
    } catch (error) {
        console.error('Tedarikçi yüklenirken hata:', error);
        showToast('Tedarikçi yüklenirken hata', 'error');
    }
}

async function deleteSupplier(supplierId) {
    if (!confirm('Bu tedarikçiyi silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/suppliers/${supplierId}`, { method: 'DELETE' });
        loadSuppliers();
        showToast('Tedarikçi silindi', 'success');
    } catch (error) {
        console.error('Tedarikçi silinirken hata:', error);
        showToast(error.message || 'Tedarikçi silme hatası', 'error');
    }
}

// Returns
async function loadReturns(page = 1, status = '') {
    try {
        const params = new URLSearchParams({ page, status });
        const data = await apiRequest(`/returns?${params}`);
        updateReturnsTable(data.returns);
        updatePagination('returns-pagination', data.page, data.totalPages, loadReturns);
    } catch (error) {
        console.error('İadeler yüklenirken hata:', error);
    }
}

function updateReturnsTable(returns) {
    const tbody = document.getElementById('returns-table');
    
    if (returns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">İade bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = returns.map(ret => `
        <tr>
            <td>${ret.order_number || '-'}</td>
            <td>${ret.customer_name || '-'}</td>
            <td>${ret.return_type === 'refund' ? 'İade' : 'Değişim'}</td>
            <td>₺${ret.refund_amount ? ret.refund_amount.toFixed(2) : '-'}</td>
            <td><span class="badge badge-${getStatusBadgeClass(ret.status)}">${getStatusLabel(ret.status)}</span></td>
            <td>${ret.reason || '-'}</td>
            <td>${formatDate(ret.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="updateReturnStatus('${ret.id}', 'approved')">
                    <i class="fas fa-check"></i>
                </button>
                <button class="btn btn-sm btn-icon" onclick="updateReturnStatus('${ret.id}', 'rejected')">
                    <i class="fas fa-times"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function updateReturnStatus(returnId, status) {
    try {
        await apiRequest(`/returns/${returnId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        loadReturns();
        showToast('İade durumu güncellendi', 'success');
    } catch (error) {
        showToast('İade durumu güncellenirken hata', 'error');
    }
}

// Coupons
async function loadCoupons() {
    try {
        const coupons = await apiRequest('/coupons');
        updateCouponsTable(coupons);
    } catch (error) {
        console.error('Kuponlar yüklenirken hata:', error);
    }
}

function updateCouponsTable(coupons) {
    const tbody = document.getElementById('coupons-table');
    
    if (coupons.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center">Kupon bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = coupons.map(coupon => `
        <tr>
            <td><strong>${coupon.code}</strong></td>
            <td>${coupon.discount_type === 'percentage' ? '%' : '₺'}</td>
            <td>${coupon.discount_value}</td>
            <td>₺${coupon.minimum_purchase || 0}</td>
            <td>₺${coupon.max_discount || '-'}</td>
            <td>${coupon.usage_limit || '∞'}</td>
            <td>${coupon.used_count || 0}</td>
            <td>${coupon.valid_until ? formatDate(coupon.valid_until) : 'Süresiz'}</td>
            <td><span class="badge badge-success">Aktif</span></td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="deleteCoupon('${coupon.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteCoupon(couponId) {
    if (!confirm('Bu kuponu silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/coupons/${couponId}`, { method: 'DELETE' });
        loadCoupons();
        showToast('Kupon silindi', 'success');
    } catch (error) {
        showToast('Kupon silme hatası', 'error');
    }
}

// Finance
async function loadFinanceSummary() {
    try {
        const summary = await apiRequest('/finance/summary');
        document.getElementById('total-income').textContent = `₺${summary.total_income.toFixed(2)}`;
        document.getElementById('total-expenses').textContent = `₺${summary.total_expenses.toFixed(2)}`;
        document.getElementById('finance-balance').textContent = `₺${summary.balance.toFixed(2)}`;
        document.getElementById('month-income').textContent = `₺${summary.month_income.toFixed(2)}`;
    } catch (error) {
        console.error('Finans özeti yüklenirken hata:', error);
    }
}

async function loadFinanceTransactions(page = 1, transactionType = '') {
    try {
        const params = new URLSearchParams({ page, transaction_type: transactionType });
        const data = await apiRequest(`/finance/transactions?${params}`);
        updateFinanceTransactionsTable(data.transactions);
        updatePagination('transactions-pagination', data.page, data.totalPages, loadFinanceTransactions);
    } catch (error) {
        console.error('Finans işlemleri yüklenirken hata:', error);
    }
}

function updateFinanceTransactionsTable(transactions) {
    const tbody = document.getElementById('transactions-table');
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">İşlem bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(transaction => `
        <tr>
            <td><span class="badge badge-${transaction.transaction_type === 'income' ? 'success' : 'danger'}">${transaction.transaction_type === 'income' ? 'Gelir' : 'Gider'}</span></td>
            <td>₺${transaction.amount.toFixed(2)}</td>
            <td>${transaction.category || '-'}</td>
            <td>${transaction.description || '-'}</td>
            <td>${transaction.payment_method || '-'}</td>
            <td><span class="badge badge-${transaction.status === 'completed' ? 'success' : 'warning'}">${transaction.status === 'completed' ? 'Tamamlandı' : 'Bekliyor'}</span></td>
            <td>${formatDate(transaction.transaction_date)}</td>
            <td>
                <button class="btn btn-sm btn-icon" onclick="deleteTransaction('${transaction.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteTransaction(transactionId) {
    if (!confirm('Bu işlemi silmek istediğinize emin misiniz?')) return;

    try {
        await apiRequest(`/finance/transactions/${transactionId}`, { method: 'DELETE' });
        loadFinanceTransactions();
        loadFinanceSummary();
        showToast('İşlem silindi', 'success');
    } catch (error) {
        console.error('İşlem silinirken hata:', error);
        showToast(error.message || 'İşlem silme hatası', 'error');
    }
}

function openTransactionModal() {
    document.getElementById('transaction-form').reset();
    document.getElementById('transaction-id').value = '';
    document.getElementById('transaction-modal-title').textContent = 'Yeni Finans İşlemi';
    openModal('transaction-modal');
}

async function saveTransaction(formData) {
    try {
        const transactionData = {
            transaction_type: formData.get('transaction_type'),
            amount: parseFloat(formData.get('amount')) || 0,
            category: formData.get('category') || null,
            description: formData.get('description') || null,
            payment_method: formData.get('payment_method') || null
        };

        if (!transactionData.transaction_type) {
            showToast('İşlem türü seçmelisiniz', 'error');
            return;
        }
        if (transactionData.amount <= 0) {
            showToast('Tutar sıfırdan büyük olmalıdır', 'error');
            return;
        }

        await apiRequest('/finance/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionData)
        });

        closeModal();
        loadFinanceTransactions();
        loadFinanceSummary();
        showToast('Finans işlemi kaydedildi', 'success');
    } catch (error) {
        console.error('Finans işlemi kaydedilirken hata:', error);
        showToast(error.message || 'İşlem hatası', 'error');
    }
}

// Activity Logs
async function loadActivityLogs(page = 1, entityType = '') {
    try {
        const params = new URLSearchParams({ page, entity_type: entityType });
        const data = await apiRequest(`/activity-logs?${params}`);
        updateActivityLogsTable(data.logs);
        updatePagination('activity-pagination', data.page, data.totalPages, loadActivityLogs);
    } catch (error) {
        console.error('Aktivite logları yüklenirken hata:', error);
    }
}

function updateActivityLogsTable(logs) {
    const tbody = document.getElementById('activity-logs-table');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Aktivite bulunamadı</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${log.user_name || '-'}</td>
            <td>${log.action}</td>
            <td>${log.entity_type || '-'}</td>
            <td>${log.entity_id || '-'}</td>
            <td>${log.details || '-'}</td>
            <td>${log.ip_address || '-'}</td>
            <td>${formatDate(log.created_at)}</td>
        </tr>
    `).join('');
}

// PDF Reports
function printInvoicePDF(orderId) {
    window.open(`${API_BASE_URL}/pdf/invoice/${orderId}`, '_blank');
}

function printStockReportPDF() {
    window.open(`${API_BASE_URL}/pdf/stock-report`, '_blank');
}

// Product Variations
function addVariation() {
    const variationsContainer = document.getElementById('product-variations');
    const variationHtml = `
        <div class="variation-item">
            <input type="text" class="variation-phone-model" placeholder="Telefon Modeli">
            <input type="text" class="variation-color" placeholder="Renk">
            <input type="text" class="variation-protection-type" placeholder="Koruma Tipi">
            <input type="number" class="variation-price" placeholder="Fiyat" step="0.01">
            <input type="number" class="variation-stock" placeholder="Stok" min="0">
            <button type="button" class="btn btn-icon remove-variation">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    variationsContainer.insertAdjacentHTML('beforeend', variationHtml);
    
    // Add remove listener
    const newVariation = variationsContainer.lastElementChild;
    newVariation.querySelector('.remove-variation').addEventListener('click', function() {
        newVariation.remove();
    });
}

function collectVariations(productId) {
    const variations = [];
    document.querySelectorAll('.variation-item').forEach(item => {
        const phoneModel = item.querySelector('.variation-phone-model').value.trim();
        const color = item.querySelector('.variation-color').value.trim();
        const protectionType = item.querySelector('.variation-protection-type').value.trim();
        const price = parseFloat(item.querySelector('.variation-price').value);
        const stock = parseInt(item.querySelector('.variation-stock').value) || 0;
        
        if (phoneModel || color || protectionType) {
            variations.push({
                phone_model: phoneModel,
                color: color,
                protection_type: protectionType,
                price: price || 0,
                stock_quantity: stock
            });
        }
    });
    return variations;
}

async function saveProductVariations(productId, variations) {
    for (const variation of variations) {
        try {
            await apiRequest('/variations', {
                method: 'POST',
                body: JSON.stringify({
                    product_id: productId,
                    ...variation
                })
            });
        } catch (error) {
            console.error('Varyasyon kaydedilirken hata:', error);
        }
    }
}

// Shipping Label
function initShippingLabel() {
    document.getElementById('label-preview').classList.add('hidden');
    document.getElementById('tracking-number').value = '';
}

function generateShippingLabel() {
    const trackingNumber = document.getElementById('tracking-number').value.trim();
    
    if (!trackingNumber) {
        showToast('Kargo takip numarası girin', 'error');
        return;
    }
    
    document.getElementById('label-tracking-number').textContent = trackingNumber;
    document.getElementById('label-preview').classList.remove('hidden');
}

function printShippingLabel() {
    const labelContainer = document.getElementById('label-container');
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
        <html>
        <head>
            <title>Kargo Etiketi</title>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                }
                .label {
                    border: 3px dashed #000;
                    padding: 20px;
                    text-align: center;
                    background: white;
                    max-width: 400px;
                }
                .tracking-number {
                    font-size: 48px;
                    font-weight: bold;
                    letter-spacing: 4px;
                    margin-bottom: 10px;
                }
                .label-text {
                    font-size: 14px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="label">
                <div class="tracking-number">${document.getElementById('label-tracking-number').textContent}</div>
                <div class="label-text">KARGO TAKİP NUMARASI</div>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// Settings
async function loadSettings() {
    try {
        const settings = await apiRequest('/settings');
        
        document.getElementById('company-name').value = settings.company_name || '';
        document.getElementById('company-phone').value = settings.phone || '';
        document.getElementById('company-email').value = settings.email || '';
        document.getElementById('company-address').value = settings.address || '';
        document.getElementById('tax-rate').value = settings.tax_rate || '';
        document.getElementById('currency').value = settings.currency || 'TRY';
    } catch (error) {
        console.error('Ayarlar yüklenirken hata:', error);
    }
}

async function saveSettings(formData) {
    try {
        const settingsData = {
            company_name: formData.get('company_name'),
            phone: formData.get('phone'),
            email: formData.get('email'),
            address: formData.get('address'),
            tax_rate: formData.get('tax_rate'),
            currency: formData.get('currency')
        };

        await apiRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });

        showToast('Ayarlar kaydedildi', 'success');
    } catch (error) {
        showToast('Ayarlar kaydedilirken hata', 'error');
    }
}

// Profile
async function loadProfile() {
    try {
        const profile = await apiRequest('/users/profile');
        
        document.getElementById('profile-username').value = profile.username;
        document.getElementById('profile-fullname').value = profile.full_name || '';
        document.getElementById('profile-email').value = profile.email || '';
    } catch (error) {
        showToast('Profil yüklenirken hata', 'error');
    }
}

async function saveProfile(formData) {
    try {
        const profileData = {
            email: formData.get('email'),
            full_name: formData.get('full_name')
        };

        await apiRequest('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });

        closeModal();
        showToast('Profil güncellendi', 'success');
    } catch (error) {
        showToast('Profil güncellenirken hata', 'error');
    }
}

async function changePassword(formData) {
    try {
        const currentPassword = formData.get('currentPassword');
        const newPassword = formData.get('newPassword');
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            showToast('Şifreler eşleşmiyor', 'error');
            return;
        }

        await apiRequest('/users/change-password', {
            method: 'PUT',
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        closeModal();
        showToast('Şifre başarıyla değiştirildi', 'success');
    } catch (error) {
        showToast('Şifre değiştirme hatası', 'error');
    }
}

// Helper Functions
function getStatusBadgeClass(status) {
    const statusMap = {
        'pending': 'warning',
        'processing': 'info',
        'shipped': 'info',
        'delivered': 'success',
        'cancelled': 'danger'
    };
    return statusMap[status] || 'secondary';
}

function getStatusLabel(status) {
    const statusMap = {
        'pending': 'Bekliyor',
        'processing': 'İşleniyor',
        'shipped': 'Kargolandı',
        'delivered': 'Teslim Edildi',
        'cancelled': 'İptal Edildi'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function updatePagination(containerId, currentPage, totalPages, loadFunction) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';

    if (currentPage > 1) {
        html += `<button onclick="${loadFunction.name}(${currentPage - 1})">Önceki</button>`;
    }

    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="${loadFunction.name}(${i})">${i}</button>`;
    }

    if (currentPage < totalPages) {
        html += `<button onclick="${loadFunction.name}(${currentPage + 1})">Sonraki</button>`;
    }

    container.innerHTML = html;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error('Toast container bulunamadı:', message);
        alert(type === 'error' ? 'HATA: ' + message : message);
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Modal Functions
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    modalOverlay.classList.remove('hidden');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
    modalOverlay.classList.add('hidden');
    
    // Reset forms
    document.querySelectorAll('form').forEach(form => form.reset());
    document.getElementById('product-id').value = '';
    document.getElementById('category-id').value = '';
    document.getElementById('customer-id').value = '';
    document.getElementById('order-id').value = '';
}

// Order Items
function addOrderItem(productId = '', quantity = 1, price = '') {
    const orderItemsContainer = document.getElementById('order-items');
    const itemHtml = `
        <div class="order-item">
            <select class="item-product" name="product_id">
                <option value="">Ürün Seçiniz</option>
            </select>
            <input type="number" class="item-quantity" name="quantity" value="${quantity}" min="1">
            <input type="number" class="item-price" name="unit_price" step="0.01" placeholder="Fiyat" value="${price}">
            <button type="button" class="btn btn-icon remove-item">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    orderItemsContainer.insertAdjacentHTML('beforeend', itemHtml);
    
    // Load products for the new select
    const newSelect = orderItemsContainer.lastElementChild.querySelector('.item-product');
    loadProductsForSelect(newSelect);
    
    if (productId) {
        newSelect.value = productId;
    }
    
    // Add event listeners for calculation
    newSelect.addEventListener('change', updateOrderTotal);
    orderItemsContainer.lastElementChild.querySelector('.item-quantity').addEventListener('input', updateOrderTotal);
    orderItemsContainer.lastElementChild.querySelector('.item-price').addEventListener('input', updateOrderTotal);
    
    updateOrderTotal();
}

function updateOrderTotal() {
    let subtotal = 0;
    
    document.querySelectorAll('.order-item').forEach(item => {
        const quantity = parseInt(item.querySelector('.item-quantity').value) || 0;
        const price = parseFloat(item.querySelector('.item-price').value) || 0;
        subtotal += quantity * price;
    });
    
    const tax = parseFloat(document.getElementById('order-tax').value) || 0;
    const shipping = parseFloat(document.getElementById('order-shipping').value) || 0;
    const discount = parseFloat(document.getElementById('order-discount').value) || 0;
    
    const total = subtotal + tax + shipping - discount;
    
    document.getElementById('order-subtotal').textContent = `₺${subtotal.toFixed(2)}`;
    document.getElementById('order-total').textContent = `₺${total.toFixed(2)}`;
}

async function loadProductsForSelect(select) {
    try {
        const data = await apiRequest('/products?limit=100');
        
        select.innerHTML = '<option value="">Ürün Seçiniz</option>';
        
        data.products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.name} - ₺${product.price.toFixed(2)}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ürünler yüklenirken hata:', error);
    }
}

async function loadCustomersForSelect() {
    try {
        const customers = await apiRequest('/customers');
        const select = document.getElementById('order-customer');
        
        select.innerHTML = '<option value="">Seçiniz</option>';
        customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = customer.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Müşteriler yüklenirken hata:', error);
    }
}

// Event Listeners
function initializeEventListeners() {
    // Login
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        login(formData.get('username'), formData.get('password'), formData.get('remember_me') === 'on');
    });

    const remembered = localStorage.getItem('rememberedUsername');
    if (remembered) {
        document.getElementById('username').value = remembered;
        document.getElementById('remember-me').checked = true;
    }

    // Navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    document.getElementById('logout-dropdown-btn').addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });

    // Apply / Onboarding / Account
    // go-to-apply and back-to-login use inline onclick in index.html
    document.getElementById('apply-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitApplication();
    });
    // Onboarding button handlers are also attached here as a fallback if index.html is cached without inline onclick
    const onboardingPwdBtn = document.getElementById('onboarding-password-btn');
    if (onboardingPwdBtn && !onboardingPwdBtn.onclick) {
        onboardingPwdBtn.addEventListener('click', () => changeOnboardingPassword());
    }
    const onboardingBusBtn = document.getElementById('onboarding-business-btn');
    if (onboardingBusBtn && !onboardingBusBtn.onclick) {
        onboardingBusBtn.addEventListener('click', () => saveOnboardingBusiness());
    }

    document.getElementById('save-account-btn').addEventListener('click', () => {
        saveAccountBusiness();
    });
    document.getElementById('account-business-form').addEventListener('submit', (e) => {
        e.preventDefault();
        saveAccountBusiness();
    });
    document.getElementById('account-change-password-btn').addEventListener('click', () => {
        changeAccountPassword();
    });
    document.getElementById('account-password-form').addEventListener('submit', (e) => {
        e.preventDefault();
        changeAccountPassword();
    });
    document.getElementById('load-applications-btn').addEventListener('click', () => {
        loadApplications();
    });
    document.getElementById('applications-filter-status').addEventListener('change', () => {
        loadApplications();
    });
    document.getElementById('applications-search').addEventListener('input', () => {
        loadApplications();
    });
    document.getElementById('open-create-user-modal-btn').addEventListener('click', () => {
        document.getElementById('create-user-form').reset();
        openModal('create-user-modal');
    });
    document.getElementById('create-user-form').addEventListener('submit', (e) => {
        e.preventDefault();
        createUserManual();
    });

    // Theme Toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        changeTheme(newTheme);
    });

    // User Menu
    document.getElementById('user-menu-btn').addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.toggle('show');
    });

    // Profile
    document.getElementById('profile-btn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('user-dropdown').classList.remove('show');
        loadProfile();
        openModal('profile-modal');
    });

    // Change Password
    document.getElementById('change-password-btn').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('user-dropdown').classList.remove('show');
        openModal('password-modal');
    });

    // Menu Toggle (Mobile)
    document.getElementById('menu-toggle').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('open');
    });

    document.querySelector('.sidebar-overlay').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('open');
    });

    // Modal Close
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Product Modal
    document.getElementById('add-product-btn').addEventListener('click', () => {
        document.getElementById('product-modal-title').textContent = 'Yeni Ürün';
        document.getElementById('product-form').reset();
        document.getElementById('product-id').value = '';
        document.getElementById('product-variations').innerHTML = `
            <div class="variation-item">
                <input type="text" class="variation-phone-model" placeholder="Telefon Modeli (Örn: iPhone 14)">
                <input type="text" class="variation-color" placeholder="Renk (Örn: Siyah)">
                <input type="text" class="variation-protection-type" placeholder="Koruma Tipi (Örn: 9D, Cam)">
                <input type="number" class="variation-price" placeholder="Fiyat" step="0.01">
                <input type="number" class="variation-stock" placeholder="Stok" min="0">
                <button type="button" class="btn btn-icon remove-variation">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        loadCategories();
        openModal('product-modal');
    });

    // Add variation
    document.getElementById('add-variation-btn').addEventListener('click', addVariation);
    
    // Variation items remove
    document.addEventListener('click', function(e) {
        if (e.target.closest('.remove-variation')) {
            e.target.closest('.variation-item').remove();
        }
    });

    document.getElementById('product-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveProduct(formData);
    });

    // Category Modal
    document.getElementById('add-category-btn').addEventListener('click', () => {
        document.getElementById('category-modal-title').textContent = 'Yeni Kategori';
        document.getElementById('category-form').reset();
        document.getElementById('category-id').value = '';
        loadCategories();
        openModal('category-modal');
    });

    document.getElementById('category-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveCategory(formData);
    });

    // Customer Modal
    document.getElementById('add-customer-btn').addEventListener('click', () => {
        document.getElementById('customer-modal-title').textContent = 'Yeni Müşteri';
        document.getElementById('customer-form').reset();
        document.getElementById('customer-id').value = '';
        openModal('customer-modal');
    });

    document.getElementById('customer-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveCustomer(formData);
    });

    // Order Modal
    document.getElementById('add-order-btn').addEventListener('click', () => {
        document.getElementById('order-modal-title').textContent = 'Yeni Sipariş';
        document.getElementById('order-form').reset();
        document.getElementById('order-id').value = '';
        document.getElementById('order-items').innerHTML = '';
        addOrderItem();
        loadCustomersForSelect();
        openModal('order-modal');
    });

    document.getElementById('order-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveOrder(formData);
    });

    document.getElementById('add-order-item').addEventListener('click', () => {
        addOrderItem();
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item')) {
            e.target.closest('.order-item').remove();
        }
    });

    // Settings
    document.getElementById('company-settings-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveSettings(formData);
    });

    // Theme Options
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            changeTheme(theme);
        });
    });

    // Profile Form
    document.getElementById('profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveProfile(formData);
    });

    // Password Form
    document.getElementById('password-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        changePassword(formData);
    });

    // Search
    document.getElementById('product-search').addEventListener('input', (e) => {
        loadProducts(1, e.target.value);
    });

    document.getElementById('customer-search').addEventListener('input', (e) => {
        loadCustomers(e.target.value);
    });

    document.getElementById('order-search').addEventListener('input', (e) => {
        loadOrders(1, document.getElementById('order-status-filter').value, e.target.value);
    });

    document.getElementById('order-status-filter').addEventListener('change', (e) => {
        loadOrders(1, e.target.value, document.getElementById('order-search').value);
    });

    // Stock movements
    document.getElementById('stock-movement-type-filter').addEventListener('change', (e) => {
        loadStockMovements(1, e.target.value);
    });

    document.getElementById('stock-search').addEventListener('input', (e) => {
        loadStockMovements(1, document.getElementById('stock-movement-type-filter').value);
    });

    document.getElementById('add-stock-movement-btn').addEventListener('click', () => {
        openStockMovementModal();
    });

    document.getElementById('stock-movement-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveStockMovement(formData);
    });

    // Suppliers
    document.getElementById('supplier-search').addEventListener('input', (e) => {
        loadSuppliers(e.target.value);
    });

    document.getElementById('add-supplier-btn').addEventListener('click', () => {
        openSupplierModal();
    });

    document.getElementById('supplier-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveSupplier(formData);
    });

    // Returns
    document.getElementById('return-status-filter').addEventListener('change', (e) => {
        loadReturns(1, e.target.value);
    });

    // Finance
    document.getElementById('transaction-type-filter').addEventListener('change', (e) => {
        loadFinanceTransactions(1, e.target.value);
    });

    document.getElementById('add-transaction-btn').addEventListener('click', () => {
        openTransactionModal();
    });

    document.getElementById('transaction-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        saveTransaction(formData);
    });

    // Activity
    document.getElementById('activity-entity-filter').addEventListener('change', (e) => {
        loadActivityLogs(1, e.target.value);
    });

    // Shipping Label
    document.getElementById('generate-label-btn').addEventListener('click', generateShippingLabel);
    document.getElementById('print-label-btn').addEventListener('click', printShippingLabel);
    document.getElementById('close-label-btn').addEventListener('click', () => {
        document.getElementById('label-preview').classList.add('hidden');
        document.getElementById('tracking-number').value = '';
    });

    // PDF Reports
    document.getElementById('generate-stock-pdf-btn').addEventListener('click', printStockReportPDF);
    document.getElementById('print-invoice-btn').addEventListener('click', function() {
        const orderId = this.dataset.orderId;
        if (orderId) {
            printInvoicePDF(orderId);
        }
    });

    // Export
    document.getElementById('export-orders-csv-btn').addEventListener('click', () => {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        
        let url = `${API_BASE_URL}/export/orders?format=csv`;
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (params.toString()) url += `&${params}`;
        
        window.open(url, '_blank');
    });

    document.getElementById('export-orders-excel-btn').addEventListener('click', () => {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        
        let url = `${API_BASE_URL}/export/orders?format=excel`;
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (params.toString()) url += `&${params}`;
        
        window.open(url, '_blank');
    });

    // Generate Report
    document.getElementById('generate-report-btn').addEventListener('click', () => {
        showToast('Rapor oluşturuluyor...', 'info');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-dropdown')) {
            document.getElementById('user-dropdown').classList.remove('show');
        }
    });
}

// Navigation
function navigateToPage(page) {
    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`${page}-page`).classList.add('active');

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Ürünler',
        'categories': 'Kategoriler',
        'stock': 'Stok',
        'suppliers': 'Tedarikçiler',
        'orders': 'Siparişler',
        'shipping-label': 'Kargo Etiketi',
        'customers': 'Müşteriler',
        'returns': 'İadeler',
        'coupons': 'Kuponlar',
        'finance': 'Finans',
        'reports': 'Raporlar',
        'activity': 'Aktivite',
        'applications': 'Kullanıcı Başvuruları',
        'users': 'Kullanıcı Yönetimi',
        'account': 'Hesap Ayarları',
        'settings': 'Ayarlar'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    // Load page data
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadProducts();
            break;
        case 'categories':
            loadCategories();
            break;
        case 'stock':
            loadStockMovements();
            break;
        case 'suppliers':
            loadSuppliers();
            break;
        case 'orders':
            loadOrders();
            break;
        case 'shipping-label':
            initShippingLabel();
            break;
        case 'customers':
            loadCustomers();
            break;
        case 'returns':
            loadReturns();
            break;
        case 'coupons':
            loadCoupons();
            break;
        case 'finance':
            loadFinanceSummary();
            loadFinanceTransactions();
            break;
        case 'activity':
            loadActivityLogs();
            break;
        case 'settings':
            loadSettings();
            break;
        case 'applications':
            loadApplications();
            break;
        case 'users':
            loadUsers();
            break;
        case 'account':
            loadAccountPage();
            break;
    }

    // Close mobile menu
    document.querySelector('.sidebar').classList.remove('open');
}

// --- Registration, onboarding and admin ---

function updateSidebarForRole() {
    if (!currentUser) return;
    if (currentUser.role === 'admin') {
        document.getElementById('nav-applications').style.display = 'flex';
        document.getElementById('nav-users').style.display = 'flex';
        document.getElementById('nav-account').style.display = 'none';
    } else {
        document.getElementById('nav-applications').style.display = 'none';
        document.getElementById('nav-users').style.display = 'none';
        document.getElementById('nav-account').style.display = 'flex';
    }
}

function loadBusinessProfile(prefix) {
    apiRequest('/business-profile').then(data => {
        if (!data || !data.id) return;
        document.getElementById(prefix + '-business-name').value = data.business_name || '';
        document.getElementById(prefix + '-authorized-name').value = data.authorized_name || '';
        document.getElementById(prefix + '-phone').value = data.phone || '';
        document.getElementById(prefix + '-email').value = data.email || '';
        document.getElementById(prefix + '-address').value = data.address || '';
        document.getElementById(prefix + '-city').value = data.city || '';
        document.getElementById(prefix + '-district').value = data.district || '';
        document.getElementById(prefix + '-tax-number').value = data.tax_number || '';
        document.getElementById(prefix + '-tax-office').value = data.tax_office || '';
        document.getElementById(prefix + '-logo-url').value = data.logo_url || '';
    }).catch(() => {});
}

function getBusinessProfileData(prefix) {
    return {
        business_name: document.getElementById(prefix + '-business-name').value.trim(),
        authorized_name: document.getElementById(prefix + '-authorized-name').value.trim(),
        phone: document.getElementById(prefix + '-phone').value.trim(),
        email: document.getElementById(prefix + '-email').value.trim(),
        address: document.getElementById(prefix + '-address').value.trim(),
        city: document.getElementById(prefix + '-city').value.trim(),
        district: document.getElementById(prefix + '-district').value.trim(),
        tax_number: document.getElementById(prefix + '-tax-number').value.trim(),
        tax_office: document.getElementById(prefix + '-tax-office').value.trim(),
        logo_url: document.getElementById(prefix + '-logo-url').value.trim()
    };
}

async function saveBusinessProfile(prefix, onSuccess) {
    try {
        const data = getBusinessProfileData(prefix);
        await apiRequest('/business-profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        if (currentUser) {
            currentUser.business_info_completed = true;
            currentUser.full_name = data.authorized_name;
            currentUser.email = data.email;
            currentUser.phone = data.phone;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
        showToast('İşletme bilgileri kaydedildi', 'success');
        onSuccess();
    } catch (error) {
        showToast(error.message || 'Kaydetme hatası', 'error');
    }
}

function loadBusinessProfileForOnboarding() {
    loadBusinessProfile('onboarding');
}

async function changeOnboardingPassword() {
    const btn = document.getElementById('onboarding-password-btn');
    const oldPassword = document.getElementById('onboarding-old-password').value;
    const newPassword = document.getElementById('onboarding-new-password').value;
    if (!oldPassword || !newPassword) {
        showToast('Şifre alanları zorunlu', 'error');
        return;
    }
    if (newPassword.length < 8) {
        showToast('Yeni şifre en az 8 karakter olmalı', 'error');
        return;
    }
    if (btn) btn.disabled = true;
    try {
        await apiRequest('/users/force-change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        if (currentUser) {
            currentUser.force_password_change = false;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
        showOnboardingScreen('business');
        showToast('Şifre güncellendi. İşletme bilgilerinizi girin.', 'success');
    } catch (error) {
        showToast(error.message || 'Şifre değiştirme hatası', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function saveOnboardingBusiness() {
    const btn = document.getElementById('onboarding-business-btn');
    const required = {
        'İşletme / Dükkan Adı': 'onboarding-business-name',
        'Yetkili Ad Soyad': 'onboarding-authorized-name',
        'Telefon': 'onboarding-phone',
        'E-posta': 'onboarding-email',
        'Adres': 'onboarding-address',
        'İl': 'onboarding-city',
        'İlçe': 'onboarding-district'
    };
    for (const [label, id] of Object.entries(required)) {
        if (!document.getElementById(id).value.trim()) {
            showToast(`${label} alanı zorunlu`, 'error');
            document.getElementById(id).focus();
            return;
        }
    }
    if (btn) btn.disabled = true;
    try {
        await saveBusinessProfile('onboarding', () => {
            showMainApp();
            loadDashboard();
            showToast('Sisteme hoş geldiniz!', 'success');
        });
    } catch (error) {
        console.error('saveOnboardingBusiness hatası:', error);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function submitApplication() {
    const data = {
        full_name: document.getElementById('apply-full-name').value.trim(),
        email: document.getElementById('apply-email').value.trim(),
        phone: document.getElementById('apply-phone').value.trim(),
        business_name: document.getElementById('apply-business-name').value.trim(),
        business_address: document.getElementById('apply-business-address').value.trim(),
        description: document.getElementById('apply-description').value.trim()
    };
    if (!data.full_name || !data.email) {
        showToast('Ad soyad ve e-posta zorunlu', 'error');
        return;
    }
    try {
        const result = await apiRequest('/applications', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        const msgEl = document.getElementById('apply-message');
        msgEl.textContent = result.message;
        msgEl.style.background = 'var(--success-color)';
        msgEl.style.color = '#fff';
        msgEl.style.display = 'block';
        document.getElementById('apply-form').reset();
    } catch (error) {
        showToast(error.message || 'Başvuru gönderilemedi', 'error');
    }
}

function getApplicationStatusLabel(status) {
    const map = { 'pending': 'Beklemede', 'approved': 'Onaylandı', 'rejected': 'Reddedildi' };
    return map[status] || status;
}

async function loadApplications() {
    try {
        const status = document.getElementById('applications-filter-status').value;
        const search = document.getElementById('applications-search').value;
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (search) params.append('search', search);
        const apps = await apiRequest(`/applications?${params.toString()}`);
        updateApplicationsTable(apps);
    } catch (error) {
        showToast(error.message || 'Başvurular yüklenemedi', 'error');
    }
}

function updateApplicationsTable(apps) {
    const tbody = document.getElementById('applications-table-body');
    if (!apps || apps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Başvuru bulunamadı</td></tr>';
        return;
    }
    tbody.innerHTML = apps.map(app => `
        <tr>
            <td>${formatDate(app.created_at)}</td>
            <td>${app.full_name}</td>
            <td>${app.email}</td>
            <td>${app.business_name || '-'}</td>
            <td><span class="badge badge-${app.status === 'pending' ? 'warning' : app.status === 'approved' ? 'success' : 'danger'}">${getApplicationStatusLabel(app.status)}</span></td>
            <td>
                ${app.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="reviewApplication('${app.id}', 'approve')">Onayla</button>
                    <button class="btn btn-sm btn-danger" onclick="reviewApplication('${app.id}', 'reject')">Reddet</button>
                ` : ''}
                <button class="btn btn-sm btn-secondary" onclick="deleteApplication('${app.id}')">Sil</button>
            </td>
        </tr>
    `).join('');
}

window.reviewApplication = async function(id, action) {
    const note = prompt(action === 'approve' ? 'Onay notu (isteğe bağlı)' : 'Ret nedeni (isteğe bağlı)') || '';
    const username = action === 'approve' ? prompt('Kullanıcı adı (boş bırakılırsa otomatik oluşturulur)') || '' : '';
    try {
        const result = await apiRequest(`/applications/${id}/review`, {
            method: 'POST',
            body: JSON.stringify({ action, review_note: note, username })
        });
        if (action === 'approve' && result.username) {
            alert(`Kullanıcı oluşturuldu:\nKullanıcı adı: ${result.username}\nGeçici şifre: ${result.temp_password}`);
        }
        loadApplications();
    } catch (error) {
        showToast(error.message || 'İşlem başarısız', 'error');
    }
};

window.deleteApplication = async function(id) {
    if (!confirm('Bu başvuruyu silmek istediğinize emin misiniz?')) return;
    try {
        await apiRequest(`/applications/${id}`, { method: 'DELETE' });
        loadApplications();
    } catch (error) {
        showToast(error.message || 'Silme başarısız', 'error');
    }
};

async function loadUsers() {
    try {
        const users = await apiRequest('/users');
        updateUsersTable(users);
    } catch (error) {
        showToast(error.message || 'Kullanıcılar yüklenemedi', 'error');
    }
}

function updateUsersTable(users) {
    const tbody = document.getElementById('users-table-body');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Kullanıcı bulunamadı</td></tr>';
        return;
    }
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.username}</td>
            <td>${u.full_name || '-'}</td>
            <td>${u.email || '-'}</td>
            <td>${u.role}</td>
            <td><span class="badge badge-${u.status === 'active' ? 'success' : 'secondary'}">${u.status === 'active' ? 'Aktif' : 'Pasif'}</span></td>
            <td>
                ${u.id !== 'admin' ? `
                    <button class="btn btn-sm ${u.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleUser('${u.id}', '${u.status === 'active' ? 'inactive' : 'active'}')">${u.status === 'active' ? 'Pasif Yap' : 'Aktif Yap'}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteUserAdmin('${u.id}')">Sil</button>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

window.toggleUser = async function(id, status) {
    try {
        await apiRequest(`/users/${id}/toggle`, {
            method: 'POST',
            body: JSON.stringify({ status })
        });
        loadUsers();
    } catch (error) {
        showToast(error.message || 'İşlem başarısız', 'error');
    }
};

window.deleteUserAdmin = async function(id) {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    try {
        await apiRequest(`/users/${id}`, { method: 'DELETE' });
        loadUsers();
    } catch (error) {
        showToast(error.message || 'Silme başarısız', 'error');
    }
};

function loadAccountPage() {
    loadBusinessProfile('account');
}

async function saveAccountBusiness() {
    await saveBusinessProfile('account', () => {
        showToast('Hesap bilgileri güncellendi', 'success');
    });
}

async function changeAccountPassword() {
    const oldPassword = document.getElementById('account-old-password').value;
    const newPassword = document.getElementById('account-new-password').value;
    if (!oldPassword || !newPassword) {
        showToast('Şifre alanları zorunlu', 'error');
        return;
    }
    if (newPassword.length < 8) {
        showToast('Yeni şifre en az 8 karakter olmalı', 'error');
        return;
    }
    try {
        await apiRequest('/users/force-change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        document.getElementById('account-password-form').reset();
        showToast('Şifre değiştirildi', 'success');
    } catch (error) {
        showToast(error.message || 'Şifre değiştirme hatası', 'error');
    }
}

async function createUserManual() {
    const full_name = document.getElementById('create-user-full-name').value.trim();
    const email = document.getElementById('create-user-email').value.trim();
    const phone = document.getElementById('create-user-phone').value.trim();
    const username = document.getElementById('create-user-username').value.trim();
    const role = document.getElementById('create-user-role').value;
    if (!full_name || !email) {
        showToast('Ad soyad ve e-posta zorunlu', 'error');
        return;
    }
    try {
        const result = await apiRequest('/users', {
            method: 'POST',
            body: JSON.stringify({ full_name, email, phone, username, role })
        });
        alert(`Kullanıcı oluşturuldu:\nKullanıcı adı: ${result.username}\nGeçici şifre: ${result.temp_password}`);
        closeModal();
        loadUsers();
    } catch (error) {
        showToast(error.message || 'Kullanıcı oluşturulamadı', 'error');
    }
}
