/**
 * Born To Shine - API Server (Final Version)
 * Backend: MongoDB Atlas + Cloudinary
 * Frontend: Hosted separately on Netlify
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const ExcelJS = require('exceljs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3050;

// ==================== CLOUDINARY CONFIG ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'born-to-shine',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
    }
});
const upload = multer({ storage });

// ==================== MONGODB CONNECTION ====================
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment variables');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

// ==================== MIDDLEWARE ====================
// CORS - يسمح لاتصال Netlify بالسيرفر
const allowedOrigins = [
    'https://born-to-shine.netlify.app',
    'http://localhost:3050',
    'http://localhost:5173'
];

app.use(cors({
    origin: function (origin, callback) {
        // السماح للطلبات بدون origin (مثل Postman) أو من النطاقات المسموحة
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // في الإنتاج، يمكنك تقييد هذا. حالياً نسمح للجميع لتجنب المشاكل
            callback(null, true);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== SCHEMAS ====================
const productSchema = new mongoose.Schema({
    name: String,
    description: String,
    category: String,
    basePrice: Number,
    sizes: [String],
    colors: [{
        name: String,
        stock: Number,
        images: [String]
    }],
    isFeatured: Boolean,
    seoTitle: String,
    seoDescription: String,
    discount: Number,
    promotion: { startDate: Date, endDate: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({
    name: String,
    slug: String
});

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    customerName: String,
    customerPhone: String,
    customerEmail: String,
    address: String,
    city: String,
    postalCode: String,
    items: [{
        productId: String,
        productName: String,
        color: String,
        size: String,
        quantity: Number,
        price: Number
    }],
    subtotal: Number,
    deliveryFee: Number,
    couponDiscount: Number,
    total: Number,
    couponCode: String,
    status: { type: String, default: 'Nouveau' },
    paymentMethod: { type: String, default: 'COD' },
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const couponSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    discount: Number,
    discountType: { type: String, enum: ['percentage', 'fixed'] },
    minOrder: Number,
    expirationDate: Date,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
    productId: String,
    customerName: String,
    rating: Number,
    comment: String,
    createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    deliveryFee: { type: Number, default: 15 },
    lowStockThreshold: { type: Number, default: 5 },
    whatsapp: String,
    instagram: String,
    facebook: String,
    email: String,
    companyName: String,
    companyAddress: String,
    adminPassword: { type: String, default: 'admin123' }
});

// Models
const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const Order = mongoose.model('Order', orderSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Review = mongoose.model('Review', reviewSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// ==================== HELPER FUNCTIONS ====================
function generateOrderNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `CH-${year}-${random}`;
}

// Initialize Default Settings & Categories
async function initializeData() {
    try {
        // Settings
        const settingsCount = await Settings.countDocuments();
        if (settingsCount === 0) {
            await Settings.create({
                deliveryFee: 15,
                lowStockThreshold: 5,
                whatsapp: '+21600000000',
                email: 'contact@borntoshine.com',
                companyName: 'Born To Shine',
                companyAddress: 'Tunisie',
                adminPassword: 'admin123'
            });
            console.log('⚙️ Default settings initialized');
        }

        // Categories
        const catCount = await Category.countDocuments();
        if (catCount === 0) {
            await Category.insertMany([
                { name: 'Femme', slug: 'femme' },
                { name: 'Homme', slug: 'homme' },
                { name: 'Enfants', slug: 'enfants' },
                { name: 'Accessoires', slug: 'accessoires' }
            ]);
            console.log('📂 Default categories initialized');
        }
    } catch (e) {
        console.error('Init error:', e.message);
    }
}
initializeData();

// ==================== ROUTES ====================

// Root - API Info (No HTML files served)
app.get('/', (req, res) => {
    res.json({
        message: 'Born To Shine API Server',
        status: 'running',
        endpoints: ['/api/products', '/api/orders', '/api/categories', '/api/settings']
    });
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// --- SETTINGS ---
app.get('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) settings = await Settings.create({});
        const safe = settings.toObject();
        delete safe.adminPassword;
        res.json(safe);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) settings = new Settings();
        Object.assign(settings, req.body);
        await settings.save();
        res.json(settings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN LOGIN ---
app.post('/api/admin/login', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) return res.status(401).json({ success: false, error: 'Not initialized' });
        if (req.body.password === settings.adminPassword) {
            res.json({ success: true, token: 'admin-' + Date.now() });
        } else {
            res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
        }
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// --- CATEGORIES ---
app.get('/api/categories', async (req, res) => {
    try { res.json(await Category.find()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/categories', async (req, res) => {
    try {
        const cat = new Category({
            name: req.body.name,
            slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, '-')
        });
        await cat.save();
        res.json(cat);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PRODUCTS ---
app.get('/api/products', async (req, res) => {
    try {
        let products = await Product.find();
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
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) res.json(product);
        else res.status(404).json({ error: 'Produit non trouvé' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', upload.array('images', 20), async (req, res) => {
    try {
        let colors = [];
        try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) {}

        let sizes = [];
        try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) {
            sizes = (req.body.sizes || 'S,M,L,XL').split(',').map(s => s.trim());
        }

        const imageUrls = req.files?.map(f => f.path) || [];
        if (imageUrls.length > 0 && colors.length > 0) {
            const perColor = Math.ceil(imageUrls.length / colors.length);
            colors.forEach((color, idx) => {
                if (!color.images) color.images = [];
                const start = idx * perColor;
                const end = start + perColor;
                color.images = [...color.images, ...imageUrls.slice(start, end)];
            });
        }

        const newProduct = new Product({
            name: req.body.name,
            description: req.body.description,
            category: req.body.category,
            basePrice: parseFloat(req.body.basePrice),
            sizes, colors,
            isFeatured: req.body.isFeatured === 'true',
            seoTitle: req.body.seoTitle,
            seoDescription: req.body.seoDescription,
            discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? {
                startDate: req.body.promotionStartDate,
                endDate: req.body.promotionEndDate
            } : null
        });
        await newProduct.save();
        res.json(newProduct);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', upload.array('images', 20), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

        let colors = [];
        try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) { colors = product.colors; }

        let sizes = [];
        try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) { sizes = product.sizes; }

        const imageUrls = req.files?.map(f => f.path) || [];
        if (imageUrls.length > 0 && colors.length > 0) {
            const perColor = Math.ceil(imageUrls.length / colors.length);
            colors.forEach((color, idx) => {
                if (!color.images) color.images = [];
                const start = idx * perColor;
                const end = start + perColor;
                color.images = [...color.images, ...imageUrls.slice(start, end)];
            });
        }

        product.set({
            name: req.body.name || product.name,
            description: req.body.description || product.description,
            category: req.body.category || product.category,
            basePrice: parseFloat(req.body.basePrice) || product.basePrice,
            sizes: sizes.length > 0 ? sizes : product.sizes,
            colors: colors.length > 0 ? colors : product.colors,
            isFeatured: req.body.isFeatured === 'true' || product.isFeatured,
            discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? {
                startDate: req.body.promotionStartDate,
                endDate: req.body.promotionEndDate
            } : product.promotion,
            updatedAt: new Date()
        });
        await product.save();
        res.json(product);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ORDERS ---
app.get('/api/orders', async (req, res) => {
    try { res.json(await Order.find().sort({ createdAt: -1 })); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:orderNumber', async (req, res) => {
    try {
        const order = await Order.findOne({ orderNumber: req.params.orderNumber });
        if (order) res.json(order);
        else res.status(404).json({ error: 'Commande non trouvée' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const products = await Product.find();
        const orderNumber = generateOrderNumber();
        const deliveryFee = settings?.deliveryFee || 15;

        let subtotal = 0;
        const orderItems = (req.body.items || []).map(item => {
            const product = products.find(p => p._id.toString() === item.productId);
            if (product) {
                const color = product.colors.find(c => c.name === item.color);
                if (color) {
                    const price = product.discount > 0
                        ? product.basePrice * (1 - product.discount / 100)
                        : product.basePrice;
                    subtotal += price * item.quantity;
                    const colorIdx = product.colors.findIndex(c => c.name === item.color);
                    product.colors[colorIdx].stock = Math.max(0, color.stock - item.quantity);
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

        await Promise.all(products.map(p => p.save()));
        const couponDiscount = parseFloat(req.body.couponDiscount) || 0;
        const total = subtotal + deliveryFee - couponDiscount;

        const newOrder = new Order({
            orderNumber, customerName: req.body.customerName,
            customerPhone: req.body.customerPhone, customerEmail: req.body.customerEmail,
            address: req.body.address, city: req.body.city,
            postalCode: req.body.postalCode, items: orderItems,
            subtotal, deliveryFee, couponDiscount, total,
            couponCode: req.body.couponCode, status: 'Nouveau',
            paymentMethod: 'COD', notes: req.body.notes
        });
        await newOrder.save();
        res.json(newOrder);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
        order.set(req.body);
        order.updatedAt = new Date();
        await order.save();
        res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- COUPONS ---
app.get('/api/coupons', async (req, res) => {
    try { res.json(await Coupon.find()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/coupons', async (req, res) => {
    try {
        const coupon = new Coupon({
            code: (req.body.code || '').toUpperCase(),
            discount: parseFloat(req.body.discount),
            discountType: req.body.discountType || 'percentage',
            minOrder: parseFloat(req.body.minOrder) || 0,
            expirationDate: req.body.expirationDate,
            isActive: req.body.isActive !== false
        });
        await coupon.save();
        res.json(coupon);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/coupons/:id', async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
        if (!coupon) return res.json({ valid: false, error: 'Code invalide' });
        if (coupon.expirationDate && new Date(coupon.expirationDate) < new Date())
            return res.json({ valid: false, error: 'Code expiré' });
        if (orderTotal < coupon.minOrder)
            return res.json({ valid: false, error: `Minimum: ${coupon.minOrder} DT` });

        const discount = coupon.discountType === 'percentage'
            ? orderTotal * (coupon.discount / 100) : coupon.discount;
        res.json({ valid: true, discount, code: coupon.code });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- REVIEWS ---
app.get('/api/reviews', async (req, res) => {
    try {
        const reviews = await Review.find();
        if (req.query.productId) {
            res.json(reviews.filter(r => r.productId === req.query.productId));
        } else { res.json(reviews); }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const review = new Review({
            productId: req.body.productId,
            customerName: req.body.customerName,
            rating: parseInt(req.body.rating) || 5,
            comment: req.body.comment
        });
        await review.save();
        res.json(review);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ANALYTICS ---
app.get('/api/analytics', async (req, res) => {
    try {
        const orders = await Order.find();
        const products = await Product.find();
        const settings = await Settings.findOne();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);

        const lowStockProducts = [];
        products.forEach(p => {
            p.colors.forEach(c => {
                if (c.stock <= (settings?.lowStockThreshold || 5) && c.stock > 0) {
                    lowStockProducts.push({ productName: p.name, color: c.name, stock: c.stock });
                }
            });
        });

        const productSales = {};
        orders.forEach(o => {
            o.items.forEach(item => {
                productSales[item.productName] = (productSales[item.productName] || 0) + item.quantity;
            });
        });

        res.json({
            totalOrders: orders.length,
            totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
            productsCount: products.length,
            pendingOrders: orders.filter(o => o.status === 'Nouveau').length,
            completedOrders: orders.filter(o => o.status === 'Livré').length,
            cancelledOrders: orders.filter(o => o.status === 'Annulé').length,
            todayRevenue: orders.filter(o => o.createdAt >= today).reduce((sum, o) => sum + o.total, 0),
            monthRevenue: orders.filter(o => o.createdAt >= thisMonth).reduce((sum, o) => sum + o.total, 0),
            yearRevenue: orders.filter(o => o.createdAt >= thisYear).reduce((sum, o) => sum + o.total, 0),
            lowStockProducts,
            bestSellingProducts: Object.entries(productSales)
                .sort((a, b) => b[1] - a[1]).slice(0, 10)
                .map(([name, qty]) => ({ name, quantity: qty }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- EXCEL EXPORT ---
app.get('/api/export/excel', async (req, res) => {
    try {
        const orders = await Order.find();
        const products = await Product.find();
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
                    date: o.createdAt.toLocaleDateString('fr-FR'),
                    customer: o.customerName, phone: o.customerPhone,
                    city: o.city, status: o.status, total: o.total
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
                    name: p.name, category: p.category,
                    price: p.basePrice,
                    stock: p.colors.reduce((s, c) => s + c.stock, 0)
                });
            });
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=rapport-${type}.xlsx`);
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`\n🚀 Born To Shine API Server running on port ${PORT}`);
    console.log(`💾 Database: MongoDB Atlas`);
    console.log(`🖼️  Images: Cloudinary`);
    console.log(`🌐 Ready to accept requests from Netlify frontend`);
});
