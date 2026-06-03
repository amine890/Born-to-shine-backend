/**
 * Born To Shine - Luxury Fashion E-commerce Platform
 * Server.js - Backend API
 * Port: 3050
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// ==================== CONFIGURATION ====================
const PORT = 3050;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const FILES = {
    products: path.join(DATA_DIR, 'products.json'),
    categories: path.join(DATA_DIR, 'categories.json'),
    orders: path.join(DATA_DIR, 'orders.json'),
    coupons: path.join(DATA_DIR, 'coupons.json'),
    reviews: path.join(DATA_DIR, 'reviews.json'),
    banners: path.join(DATA_DIR, 'banners.json'),
    settings: path.join(DATA_DIR, 'settings.json'),
    wishlist: path.join(DATA_DIR, 'wishlist.json')
};

// ==================== INITIALIZATION ====================
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create directories
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Static files
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(__dirname));

// Multer setup
const multer = require('multer');
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(allowed.includes(ext) ? null : new Error('Type non autorisé'), allowed.includes(ext));
    }
});

// ==================== HELPER FUNCTIONS ====================
function readJSON(file, defaultValue = []) {
    try {
        if (!fs.existsSync(file)) {
            writeJSON(file, defaultValue);
            return defaultValue;
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`Erreur lecture ${file}:`, e.message);
        return defaultValue;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`Erreur écriture ${file}:`, e.message);
    }
}

function generateOrderNumber() {
    const orders = readJSON(FILES.orders, []);
    const year = new Date().getFullYear();
    const prefix = `CH-${year}-`;
    const maxNum = orders
        .filter(o => o.orderNumber?.startsWith(prefix))
        .reduce((max, o) => Math.max(max, parseInt(o.orderNumber.replace(prefix, '')) || 0), 0);
    return `${prefix}${String(maxNum + 1).padStart(6, '0')}`;
}

function initializeData() {
    console.log('📂 Initialisation des données...');
    
    const defaults = {
        [FILES.categories]: [
            { id: 1, name: 'Femme', slug: 'femme' },
            { id: 2, name: 'Homme', slug: 'homme' },
            { id: 3, name: 'Enfants', slug: 'enfants' },
            { id: 4, name: 'Accessoires', slug: 'accessoires' }
        ],
        [FILES.products]: [],
        [FILES.orders]: [],
        [FILES.coupons]: [],
        [FILES.reviews]: [],
        [FILES.banners]: [],
        [FILES.wishlist]: [],
        [FILES.settings]: {
            deliveryFee: 15,
            lowStockThreshold: 5,
            whatsapp: '+21600000000',
            instagram: '',
            facebook: '',
            messenger: '',
            email: 'contact@borntoshine.com',
            companyName: 'Born To Shine',
            companyAddress: 'Tunisie',
            adminPassword: 'admin123'
        }
    };

    Object.entries(defaults).forEach(([file, data]) => {
        if (!fs.existsSync(file) || readJSON(file, []).length === 0) {
            writeJSON(file, data);
        }
    });
    
    console.log('✅ Données initialisées');
}

initializeData();

// ==================== ROUTES - HTML PAGES ====================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'store.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ==================== ROUTES - CATEGORIES ====================
app.get('/api/categories', (req, res) => {
    res.json(readJSON(FILES.categories, []));
});

app.post('/api/categories', (req, res) => {
    try {
        const categories = readJSON(FILES.categories, []);
        const newCat = {
            id: Date.now(),
            name: req.body.name,
            slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, '-')
        };
        categories.push(newCat);
        writeJSON(FILES.categories, categories);
        res.json(newCat);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/categories/:id', (req, res) => {
    try {
        const categories = readJSON(FILES.categories, []);
        const idx = categories.findIndex(c => c.id === parseInt(req.params.id));
        if (idx === -1) return res.status(404).json({ error: 'Catégorie non trouvée' });
        
        categories[idx] = { ...categories[idx], ...req.body };
        writeJSON(FILES.categories, categories);
        res.json(categories[idx]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/categories/:id', (req, res) => {
    try {
        let categories = readJSON(FILES.categories, []);
        categories = categories.filter(c => c.id !== parseInt(req.params.id));
        writeJSON(FILES.categories, categories);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - PRODUCTS ====================
app.get('/api/products', (req, res) => {
    try {
        let products = readJSON(FILES.products, []);
        const { category, search, featured } = req.query;
        
        if (category) products = products.filter(p => p.category === category);
        if (search) {
            const q = search.toLowerCase();
            products = products.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.description.toLowerCase().includes(q)
            );
        }
        if (featured === 'true') products = products.filter(p => p.isFeatured);
        
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/products/:id', (req, res) => {
    try {
        const products = readJSON(FILES.products, []);
        const product = products.find(p => p.id === parseInt(req.params.id));
        if (product) res.json(product);
        else res.status(404).json({ error: 'Produit non trouvé' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/products', upload.array('images', 20), (req, res) => {
    try {
        const products = readJSON(FILES.products, []);
        
        let colors = [];
        try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) { colors = []; }
        
        let sizes = [];
        try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) { 
            sizes = (req.body.sizes || 'S,M,L,XL').split(',').map(s => s.trim());
        }
        
        // Process images
        const imageFiles = req.files || [];
        const imageUrls = imageFiles.map(f => `/uploads/${f.filename}`);
        
        if (imageUrls.length > 0 && colors.length > 0) {
            const perColor = Math.ceil(imageUrls.length / colors.length);
            colors.forEach((color, idx) => {
                if (!color.images) color.images = [];
                color.images = [...color.images, ...imageUrls.slice(idx * perColor, (idx + 1) * perColor)];
            });
        }
        
        const newProduct = {
            id: Date.now(),
            name: req.body.name,
            description: req.body.description || '',
            category: req.body.category,
            basePrice: parseFloat(req.body.basePrice) || 0,
            sizes,
            colors,
            isFeatured: req.body.isFeatured === 'true' || req.body.isFeatured === true,
            seoTitle: req.body.seoTitle || req.body.name,
            seoDescription: req.body.seoDescription || req.body.description || '',
            discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? {
                startDate: req.body.promotionStartDate,
                endDate: req.body.promotionEndDate
            } : null,
            createdAt: new Date().toISOString()
        };
        
        products.push(newProduct);
        writeJSON(FILES.products, products);
        res.json(newProduct);
    } catch (e) {
        console.error('Erreur création produit:', e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/products/:id', upload.array('images', 20), (req, res) => {
    try {
        const products = readJSON(FILES.products, []);
        const idx = products.findIndex(p => p.id === parseInt(req.params.id));
        
        if (idx === -1) return res.status(404).json({ error: 'Produit non trouvé' });
        
        let colors = [];
        try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) { colors = products[idx].colors || []; }
        
        let sizes = [];
        try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) { sizes = products[idx].sizes || []; }
        
        // Process images - preserve existing images
        const imageFiles = req.files || [];
        const imageUrls = imageFiles.map(f => `/uploads/${f.filename}`);
        
        if (colors.length > 0) {
            const oldColors = products[idx].colors || [];
            
            colors.forEach((color, i) => {
                const oldColor = oldColors.find(oc => oc.name === color.name);
                
                // Keep existing images if no new images
                if (!color.images || color.images.length === 0) {
                    color.images = oldColor ? (oldColor.images || []) : [];
                }
                
                // Add new images if uploaded
                if (imageUrls.length > 0) {
                    const perColor = Math.ceil(imageUrls.length / colors.length);
                    const newImages = imageUrls.slice(i * perColor, (i + 1) * perColor);
                    color.images = [...color.images, ...newImages];
                }
            });
        }
        
        products[idx] = {
            ...products[idx],
            name: req.body.name || products[idx].name,
            description: req.body.description || products[idx].description,
            category: req.body.category || products[idx].category,
            basePrice: parseFloat(req.body.basePrice) || products[idx].basePrice,
            sizes: sizes.length > 0 ? sizes : products[idx].sizes,
            colors: colors.length > 0 ? colors : products[idx].colors,
            isFeatured: req.body.isFeatured === 'true' || products[idx].isFeatured,
            discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? {
                startDate: req.body.promotionStartDate,
                endDate: req.body.promotionEndDate
            } : products[idx].promotion,
            updatedAt: new Date().toISOString()
        };
        
        writeJSON(FILES.products, products);
        res.json(products[idx]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/products/:id', (req, res) => {
    try {
        let products = readJSON(FILES.products, []);
        products = products.filter(p => p.id !== parseInt(req.params.id));
        writeJSON(FILES.products, products);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - ORDERS ====================
app.get('/api/orders', (req, res) => {
    try {
        const orders = readJSON(FILES.orders, []);
        res.json(orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/orders/:orderNumber', (req, res) => {
    try {
        const orders = readJSON(FILES.orders, []);
        const order = orders.find(o => o.orderNumber === req.params.orderNumber);
        if (order) res.json(order);
        else res.status(404).json({ error: 'Commande non trouvée' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/orders', (req, res) => {
    try {
        const orders = readJSON(FILES.orders, []);
        const settings = readJSON(FILES.settings, {});
        const products = readJSON(FILES.products, []);
        
        const orderNumber = generateOrderNumber();
        const deliveryFee = parseFloat(settings.deliveryFee) || 15;
        
        let subtotal = 0;
        const orderItems = (req.body.items || []).map(item => {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const color = product.colors.find(c => c.name === item.color);
                if (color) {
                    const price = product.discount > 0 
                        ? product.basePrice * (1 - product.discount / 100)
                        : product.basePrice;
                    subtotal += price * item.quantity;
                    color.stock = Math.max(0, color.stock - item.quantity);
                }
            }
            return {
                productId: item.productId,
                productName: item.productName,
                color: item.color,
                size: item.size,
                quantity: item.quantity,
                price: item.price
            };
        });
        
        writeJSON(FILES.products, products);
        
        const couponDiscount = parseFloat(req.body.couponDiscount) || 0;
        
        const newOrder = {
            id: Date.now(),
            orderNumber,
            customerName: req.body.customerName,
            customerPhone: req.body.customerPhone,
            customerEmail: req.body.customerEmail || '',
            address: req.body.address,
            city: req.body.city,
            postalCode: req.body.postalCode || '',
            items: orderItems,
            subtotal,
            deliveryFee,
            couponDiscount,
            total: subtotal + deliveryFee - couponDiscount,
            couponCode: req.body.couponCode || null,
            status: 'Nouveau',
            paymentMethod: 'COD',
            notes: req.body.notes || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        orders.push(newOrder);
        writeJSON(FILES.orders, orders);
        res.json(newOrder);
    } catch (e) {
        console.error('Erreur création commande:', e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/orders/:id', (req, res) => {
    try {
        const orders = readJSON(FILES.orders, []);
        const idx = orders.findIndex(o => o.id === parseInt(req.params.id));
        
        if (idx === -1) return res.status(404).json({ error: 'Commande non trouvée' });
        
        orders[idx] = { ...orders[idx], ...req.body, updatedAt: new Date().toISOString() };
        writeJSON(FILES.orders, orders);
        res.json(orders[idx]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - COUPONS ====================
app.get('/api/coupons', (req, res) => {
    res.json(readJSON(FILES.coupons, []));
});

app.post('/api/coupons', (req, res) => {
    try {
        const coupons = readJSON(FILES.coupons, []);
        const newCoupon = {
            id: Date.now(),
            code: (req.body.code || '').toUpperCase(),
            discount: parseFloat(req.body.discount) || 0,
            discountType: req.body.discountType || 'percentage',
            minOrder: parseFloat(req.body.minOrder) || 0,
            expirationDate: req.body.expirationDate || null,
            isActive: req.body.isActive !== false,
            createdAt: new Date().toISOString()
        };
        coupons.push(newCoupon);
        writeJSON(FILES.coupons, coupons);
        res.json(newCoupon);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/coupons/:id', (req, res) => {
    try {
        let coupons = readJSON(FILES.coupons, []);
        coupons = coupons.filter(c => c.id !== parseInt(req.params.id));
        writeJSON(FILES.coupons, coupons);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/coupons/validate', (req, res) => {
    try {
        const coupons = readJSON(FILES.coupons, []);
        const { code, orderTotal } = req.body;
        
        const coupon = coupons.find(c => c.code === (code || '').toUpperCase());
        
        if (!coupon) return res.json({ valid: false, error: 'Code invalide' });
        if (!coupon.isActive) return res.json({ valid: false, error: 'Code inactif' });
        if (coupon.expirationDate && new Date(coupon.expirationDate) < new Date()) {
            return res.json({ valid: false, error: 'Code expiré' });
        }
        if (orderTotal < coupon.minOrder) {
            return res.json({ valid: false, error: `Minimum: ${coupon.minOrder} DT` });
        }
        
        const discount = coupon.discountType === 'percentage' 
            ? orderTotal * (coupon.discount / 100)
            : coupon.discount;
        
        res.json({ valid: true, discount, code: coupon.code });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - REVIEWS ====================
app.get('/api/reviews', (req, res) => {
    try {
        const reviews = readJSON(FILES.reviews, []);
        if (req.query.productId) {
            res.json(reviews.filter(r => r.productId === parseInt(req.query.productId)));
        } else {
            res.json(reviews);
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/reviews', (req, res) => {
    try {
        const reviews = readJSON(FILES.reviews, []);
        const newReview = {
            id: Date.now(),
            productId: parseInt(req.body.productId),
            customerName: req.body.customerName,
            rating: parseInt(req.body.rating) || 5,
            comment: req.body.comment || '',
            createdAt: new Date().toISOString()
        };
        reviews.push(newReview);
        writeJSON(FILES.reviews, reviews);
        res.json(newReview);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - BANNERS ====================
app.get('/api/banners', (req, res) => {
    try {
        let banners = readJSON(FILES.banners, []);
        const now = new Date();
        banners = banners.filter(b => !b.expirationDate || new Date(b.expirationDate) > now);
        res.json(banners);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/banners', upload.single('image'), (req, res) => {
    try {
        const banners = readJSON(FILES.banners, []);
        const newBanner = {
            id: Date.now(),
            title: req.body.title,
            description: req.body.description || '',
            image: req.file ? `/uploads/${req.file.filename}` : '',
            expirationDate: req.body.expirationDate || null,
            isActive: true,
            createdAt: new Date().toISOString()
        };
        banners.push(newBanner);
        writeJSON(FILES.banners, banners);
        res.json(newBanner);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/banners/:id', (req, res) => {
    try {
        let banners = readJSON(FILES.banners, []);
        banners = banners.filter(b => b.id !== parseInt(req.params.id));
        writeJSON(FILES.banners, banners);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - SETTINGS ====================
app.get('/api/settings', (req, res) => {
    try {
        const settings = readJSON(FILES.settings, {});
        const safe = { ...settings };
        delete safe.adminPassword;
        res.json(safe);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/settings', (req, res) => {
    try {
        const settings = readJSON(FILES.settings, {});
        const updated = { ...settings, ...req.body };
        writeJSON(FILES.settings, updated);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - ADMIN LOGIN ====================
app.post('/api/admin/login', (req, res) => {
    try {
        const settings = readJSON(FILES.settings, {});
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ success: false, error: 'Mot de passe requis' });
        }
        
        if (password === settings.adminPassword) {
            res.json({ 
                success: true, 
                token: 'admin-' + Date.now(),
                message: 'Connexion réussie'
            });
        } else {
            res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ==================== ROUTES - ANALYTICS ====================
app.get('/api/analytics', (req, res) => {
    try {
        const orders = readJSON(FILES.orders, []);
        const products = readJSON(FILES.products, []);
        const settings = readJSON(FILES.settings, {});
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);
        
        // Low stock products
        const lowStockProducts = [];
        products.forEach(p => {
            (p.colors || []).forEach(c => {
                if (c.stock <= (settings.lowStockThreshold || 5) && c.stock > 0) {
                    lowStockProducts.push({ productName: p.name, color: c.name, stock: c.stock });
                }
            });
        });
        
        // Best selling products
        const productSales = {};
        orders.forEach(order => {
            (order.items || []).forEach(item => {
                productSales[item.productName] = (productSales[item.productName] || 0) + item.quantity;
            });
        });
        
        res.json({
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + (o.total || 0), 0),
            productsCount: products.length,
            pendingOrders: orders.filter(o => o.status === 'Nouveau').length,
            completedOrders: orders.filter(o => o.status === 'Livré').length,
            cancelledOrders: orders.filter(o => o.status === 'Annulé').length,
            todayRevenue: orders.filter(o => new Date(o.createdAt) >= today).reduce((sum, o) => sum + (o.total || 0), 0),
            monthRevenue: orders.filter(o => new Date(o.createdAt) >= thisMonth).reduce((sum, o) => sum + (o.total || 0), 0),
            yearRevenue: orders.filter(o => new Date(o.createdAt) >= thisYear).reduce((sum, o) => sum + (o.total || 0), 0),
            lowStockProducts,
            bestSellingProducts: Object.entries(productSales)
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([name, quantity]) => ({ name, quantity }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - EXCEL EXPORT ====================
app.get('/api/export/excel', async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const orders = readJSON(FILES.orders, []);
        const products = readJSON(FILES.products, []);
        const { type } = req.query;
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Rapport');
        
        if (type === 'orders') {
            worksheet.columns = [
                { header: 'Numéro', key: 'orderNumber', width: 20 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Client', key: 'customer', width: 25 },
                { header: 'Téléphone', key: 'phone', width: 15 },
                { header: 'Ville', key: 'city', width: 15 },
                { header: 'Statut', key: 'status', width: 15 },
                { header: 'Total', key: 'total', width: 12 }
            ];
            orders.forEach(o => {
                worksheet.addRow({
                    orderNumber: o.orderNumber,
                    date: new Date(o.createdAt).toLocaleDateString('fr-FR'),
                    customer: o.customerName,
                    phone: o.customerPhone,
                    city: o.city,
                    status: o.status,
                    total: o.total
                });
            });
            worksheet.addRow({});
            worksheet.addRow({ orderNumber: 'TOTAL', total: orders.reduce((s, o) => s + o.total, 0) });
        } else if (type === 'products') {
            worksheet.columns = [
                { header: 'Nom', key: 'name', width: 30 },
                { header: 'Catégorie', key: 'category', width: 15 },
                { header: 'Prix', key: 'price', width: 12 },
                { header: 'Stock', key: 'stock', width: 10 }
            ];
            products.forEach(p => {
                worksheet.addRow({
                    name: p.name,
                    category: p.category,
                    price: p.basePrice,
                    stock: (p.colors || []).reduce((s, c) => s + c.stock, 0)
                });
            });
        }
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=rapport-${type}.xlsx`);
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
    } catch (e) {
        console.error('Erreur export:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==================== ROUTES - WISHLIST ====================
app.get('/api/wishlist', (req, res) => {
    res.json(readJSON(FILES.wishlist, []));
});

app.post('/api/wishlist', (req, res) => {
    try {
        const wishlist = readJSON(FILES.wishlist, []);
        const { productId } = req.body;
        if (!wishlist.includes(productId)) {
            wishlist.push(productId);
            writeJSON(FILES.wishlist, wishlist);
        }
        res.json({ success: true, wishlist });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/wishlist/:productId', (req, res) => {
    try {
        let wishlist = readJSON(FILES.wishlist, []);
        wishlist = wishlist.filter(id => id !== parseInt(req.params.productId));
        writeJSON(FILES.wishlist, wishlist);
        res.json({ success: true, wishlist });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ error: err.message });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('🌟 Born To Shine - Serveur Démarré');
    console.log('========================================');
    console.log(`📦 Boutique: http://localhost:${PORT}`);
    console.log(`🔐 Admin:    http://localhost:${PORT}/admin`);
    console.log(`🔑 Mot de passe: admin123`);
    console.log('========================================\n');
});