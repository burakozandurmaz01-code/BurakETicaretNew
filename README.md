# Burak E-Ticaret Yönetim Sistemi

Kapsamlı, modern ve kullanıcı dostu e-ticaret yönetim sistemi.

## Özellikler

### 🎯 Temel Özellikler
- **Kullanıcı Yönetimi**: Kayıt, giriş, profil düzenleme, şifre değiştirme
- **Tema Desteği**: Aydınlık, karanlık ve otomatik tema seçenekleri
- **Rol Bazlı Yetkilendirme**: Admin ve kullanıcı rolleri

### 📦 Ürün Yönetimi
- Ürün ekleme, düzenleme, silme
- Kategori atama
- Stok takibi
- Fiyat yönetimi (satış ve maliyet)
- Barkod ve SKU desteği
- Ürün resmi yükleme
- Aktif/pasif durumu

### 🏷️ Kategori Yönetimi
- Kategori ekleme, düzenleme, silme
- Alt kategori desteği
- Kategori açıklamaları

### � Stok Yönetimi
- Stok hareket takibi (giriş, çıkış, düzeltme)
- Stok hareketleri geçmişi
- Otomatik stok güncelleme
- Düşük stok uyarıları
- Stok raporları

### 🚚 Tedarikçi Yönetimi
- Tedarikçi ekleme, düzenleme, silme
- İletişim bilgileri yönetimi
- Vergi bilgileri
- Ödeme şartları
- Tedarikçi performans takibi

### �🛒 Sipariş Yönetimi
- Sipariş oluşturma
- Sipariş durumu takibi (Bekliyor, İşleniyor, Kargolandı, Teslim Edildi, İptal)
- Sipariş detayları görüntüleme
- Mülti-ürün sipariş desteği
- Vergi, kargo ve indirim hesaplama
- Otomatik stok güncelleme

### 👥 Müşteri Yönetimi
- Müşteri ekleme, düzenleme, silme
- İletişim bilgileri (e-posta, telefon)
- Adres bilgileri
- Vergi numarası ve vergi dairesi

### � İade Yönetimi
- İade talepleri oluşturma
- İade durumu takibi (Bekliyor, Onaylandı, Reddedildi, Tamamlandı)
- İade türleri (İade, Değişim)
- Otomatik stok güncelleme
- İade raporları

### 🎫 Kupon/İndirim Sistemi
- Kupon oluşturma ve yönetimi
- Yüzdelik ve sabit tutar indirim
- Minimum sipariş tutarı kısıtlaması
- Maksimum indirim limiti
- Kullanım limiti
- Geçerlilik tarihleri
- Kupon doğrulama

### 💰 Finans Yönetimi
- Gelir ve gider takibi
- Finansal işlemler
- Kategori bazlı raporlama
- Ödeme yöntemleri
- Bakiye takibi
- Aylık finansal özet
- Finans raporları

### 📋 Aktivite Logları
- Tüm kullanıcı işlemlerinin kaydı
- Denetim trail
- IP adresi ve user agent takibi
- Varlık bazlı filtreleme
- Aktivite raporları

### �📊 Dashboard ve Raporlar
- Gerçek zamanlı istatistikler
- Satış grafiği (Chart.js)
- Son siparişler listesi
- Düşük stok uyarısı
- Bekleyen sipariş takibi
- CSV ve Excel dışa aktarım
- Tarih bazlı raporlama

### ⚙️ Ayarlar
- Şirket bilgileri yönetimi
- Vergi oranı ayarı
- Para birimi seçimi
- Tema tercihleri

## Kurulum

### Gereksinimler
- Node.js (v14 veya üzeri)
- npm (Node.js ile birlikte gelir)

### Adım 1: Node.js Kurulumu

Node.js yüklü değilse, aşağıdaki adresten indirip kurun:
https://nodejs.org/

Kurulumdan sonra komut satırında şu komutla kontrol edin:
```bash
node --version
npm --version
```

### Adım 2: Proje Kurulumu

1. Proje dizinine gidin:
```bash
cd C:\Users\pc\CascadeProjects\BurakETicaretNew
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

### Adım 3: Uygulamayı Başlatma

Geliştirme modunda başlatmak için:
```bash
npm run dev
```

Production modunda başlatmak için:
```bash
npm start
```

Uygulama varsayılan olarak `http://localhost:5000` adresinde çalışacaktır.

### Adım 4: Giriş Yapma

Varsayılan admin bilgileri:
- **Kullanıcı Adı**: admin
- **Şifre**: admin123

⚠️ **Önemli**: İlk girişten sonra şifrenizi değiştirmeniz önerilir!

## Proje Yapısı

```
BurakETicaretNew/
├── server.js              # Backend sunucusu
├── package.json           # Proje bağımlılıkları
├── database/              # SQLite veritabanı dosyaları
│   └── burak_eticaret.db
├── uploads/               # Yüklenen resimler
│   └── products/
├── client/                # Frontend dosyaları
│   ├── index.html        # Ana HTML dosyası
│   ├── styles.css        # Stil dosyası
│   └── app.js            # JavaScript uygulama mantığı
└── README.md             # Bu dosya
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Giriş yap
- `POST /api/auth/register` - Kayıt ol

### Users
- `GET /api/users/profile` - Profil bilgileri
- `PUT /api/users/profile` - Profil güncelle
- `PUT /api/users/change-password` - Şifre değiştir
- `PUT /api/users/theme` - Tema değiştir

### Products
- `GET /api/products` - Ürün listesi
- `GET /api/products/:id` - Ürün detayı
- `POST /api/products` - Ürün ekle
- `PUT /api/products/:id` - Ürün güncelle
- `DELETE /api/products/:id` - Ürün sil

### Categories
- `GET /api/categories` - Kategori listesi
- `POST /api/categories` - Kategori ekle
- `PUT /api/categories/:id` - Kategori güncelle
- `DELETE /api/categories/:id` - Kategori sil

### Orders
- `GET /api/orders` - Sipariş listesi
- `GET /api/orders/:id` - Sipariş detayı
- `POST /api/orders` - Sipariş oluştur
- `PUT /api/orders/:id` - Sipariş güncelle
- `DELETE /api/orders/:id` - Sipariş sil

### Customers
- `GET /api/customers` - Müşteri listesi
- `POST /api/customers` - Müşteri ekle
- `PUT /api/customers/:id` - Müşteri güncelle
- `DELETE /api/customers/:id` - Müşteri sil

### Dashboard
- `GET /api/dashboard/stats` - İstatistikler
- `GET /api/dashboard/recent-orders` - Son siparişler
- `GET /api/dashboard/sales-chart` - Satış grafiği

### Settings
- `GET /api/settings` - Ayarlar
- `PUT /api/settings` - Ayarları güncelle

### Export
- `GET /api/export/orders` - Siparişleri CSV olarak dışa aktar

## Teknolojiler

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **SQLite** - Veritabanı
- **bcryptjs** - Şifre hashleme
- **jsonwebtoken** - JWT authentication
- **multer** - Dosya yükleme
- **helmet** - Güvenlik header'ları
- **express-rate-limit** - Rate limiting

### Frontend
- **Vanilla JavaScript** - Framework gerektirmez
- **Chart.js** - Grafikler
- **Font Awesome** - İkonlar
- **Modern CSS** - Responsive tasarım

## Güvenlik

- JWT token tabanlı authentication
- Şifre bcrypt ile hash'lenir
- Rate limiting ile API koruması
- Helmet ile güvenlik header'ları
- Input validation
- SQL injection koruması (parameterized queries)

## Tema Kullanımı

Uygulama 3 tema modunu destekler:
- **Light**: Aydınlık tema
- **Dark**: Karanlık tema
- **Auto**: Sistem tercihine göre otomatik

Tema değiştirmek için:
1. Sağ üst köşedeki ayar ikonuna tıklayın
2. "Profil" > "Ayarlar" sayfasına gidin
3. İstenilen temayı seçin

veya sağ üst köşedeki ay/kare ikonuna tıklayarak hızlıca değiştirin.

## Veritabanı Yedekleme

Veritabanı dosyası `database/burak_eticaret.db` konumundadır. Yedeklemek için:

1. Uygulamayı durdurun
2. `database/burak_eticaret.db` dosyasını kopyalayın
3. Yedek güvenli bir yerde saklayın

## Sorun Giderme

### Port 5000 kullanımda hatası
`package.json` dosyasındaki PORT değerini değiştirin veya `server.js` dosyasında PORT değişkenini güncelleyin.

### Veritabanı hatası
`database` klasörünün var olduğundan ve yazma izniniz olduğundan emin olun.

### Resim yükleme hatası
`uploads/products` klasörünün var olduğundan ve yazma izniniz olduğundan emin olun.

## Lisans

Bu proje kişisel kullanım için geliştirilmiştir.

## Destek

Sorularınız için geliştirici ile iletişime geçin.
