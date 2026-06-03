/**
 * Born To Shine - API Server (Final Production Version)
 * MongoDB Atlas + Cloudinary + CORS for Netlify
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 3050;

// ==================== CLOUDINARY ====================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'born-to-shine',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'limit' }]
    }
});
const upload = multer({ storage });

// ==================== MONGODB ====================
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== SCHEMAS ====================
const productSchema = new mongoose.Schema({
    name: String, description: String, category: String, basePrice: Number,
    sizes: [String],
    colors: [{ name: String, stock: Number, images: [String] }],
    isFeatured: Boolean, seoTitle: String, seoDescription: String,
    discount: Number, promotion: { startDate: Date, endDate: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const categorySchema = new mongoose.Schema({ name: String, slug: String });

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    customerName: String, customerPhone: String, customerEmail: String,
    address: String, city: String, postalCode: String,
    items: [{ productId: String, productName: String, color: String, size: String, quantity: Number, price: Number }],
    subtotal: Number, deliveryFee: Number, couponDiscount: Number, total: Number,
    couponCode: String, status: { type: String, default: 'Nouveau' },
    paymentMethod: { type: String, default: 'COD' }, notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const couponSchema = new mongoose.Schema({
    code: { type: String, unique: true }, discount: Number,
    discountType: { type: String, enum: ['percentage', 'fixed'] },
    minOrder: Number, expirationDate: Date,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const reviewSchema = new mongoose.Schema({
    productId: String, customerName: String, rating: Number, comment: String,
    createdAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    deliveryFee: { type: Number, default: 15 },
    lowStockThreshold: { type: Number, default: 5 },
    whatsapp: String, instagram: String, facebook: String, email: String,
    companyName: String, companyAddress: String,
    adminPassword: { type: String, default: 'admin123' }
});

const Product = mongoose.model('Product', productSchema);
const Category = mongoose.model('Category', categorySchema);
const Order = mongoose.model('Order', orderSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Review = mongoose.model('Review', reviewSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// ==================== HELPERS ====================
function generateOrderNumber() {
    const year = new Date().getFullYear();
    const num = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    return `CH-${year}-${num}`;
}

async function initializeData() {
    try {
        if ((await Settings.countDocuments()) === 0) {
            await Settings.create({
                deliveryFee: 15, lowStockThreshold: 5,
                whatsapp: '+21600000000', email: 'contact@borntoshine.com',
                companyName: 'Born To Shine', companyAddress: 'Tunisie',
                adminPassword: 'admin123'
            });
            console.log('⚙️ Settings initialized');
        }
        if ((await Category.countDocuments()) === 0) {
            await Category.insertMany([
                { name: 'Femme', slug: 'femme' }, { name: 'Homme', slug: 'homme' },
                { name: 'Enfants', slug: 'enfants' }, { name: 'Accessoires', slug: 'accessoires' }
            ]);
            console.log('📂 Categories initialized');
        }
    } catch (e) { console.error('Init error:', e.message); }
}
initializeData();

// ==================== ROUTES ====================
app.get('/', (req, res) => res.json({ message: 'Born To Shine API', status: 'running' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// SETTINGS
app.get('/api/settings', async (req, res) => {
    try {
        let s = await Settings.findOne();
        if (!s) s = await Settings.create({});
        const safe = s.toObject(); delete safe.adminPassword;
        res.json(safe);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/settings', async (req, res) => {
    try {
        let s = await Settings.findOne();
        if (!s) s = new Settings();
        Object.assign(s, req.body); await s.save();
        res.json(s);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN LOGIN
app.post('/api/admin/login', async (req, res) => {
    try {
        const s = await Settings.findOne();
        if (!s) return res.status(401).json({ success: false, error: 'Not initialized' });
        if (req.body.password === s.adminPassword) return res.json({ success: true, token: 'admin-' + Date.now() });
        res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// CATEGORIES
app.get('/api/categories', async (req, res) => { try { res.json(await Category.find()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/categories', async (req, res) => {
    try {
        const c = new Category({ name: req.body.name, slug: req.body.slug || req.body.name.toLowerCase().replace(/\s+/g, '-') });
        await c.save(); res.json(c);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/categories/:id', async (req, res) => { try { await Category.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// PRODUCTS
app.get('/api/products', async (req, res) => {
    try {
        let p = await Product.find();
        const { category, search, featured } = req.query;
        if (category) p = p.filter(x => x.category === category);
        if (search) { const q = search.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q)); }
        if (featured === 'true') p = p.filter(x => x.isFeatured);
        res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/products/:id', async (req, res) => {
    try { const p = await Product.findById(req.params.id); p ? res.json(p) : res.status(404).json({ error: 'Not found' }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/products', upload.array('images', 20), async (req, res) => {
    try {
        let colors = []; try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) {}
        let sizes = []; try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) { sizes = (req.body.sizes || 'S,M,L,XL').split(',').map(s => s.trim()); }
        const urls = req.files?.map(f => f.path) || [];
        if (urls.length > 0 && colors.length > 0) {
            const per = Math.ceil(urls.length / colors.length);
            colors.forEach((c, i) => { if (!c.images) c.images = []; c.images = [...c.images, ...urls.slice(i * per, (i + 1) * per)]; });
        }
        const np = new Product({
            name: req.body.name, description: req.body.description, category: req.body.category,
            basePrice: parseFloat(req.body.basePrice), sizes, colors,
            isFeatured: req.body.isFeatured === 'true', seoTitle: req.body.seoTitle,
            seoDescription: req.body.seoDescription, discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? { startDate: req.body.promotionStartDate, endDate: req.body.promotionEndDate } : null
        });
        await np.save(); res.json(np);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/products/:id', upload.array('images', 20), async (req, res) => {
    try {
        const p = await Product.findById(req.params.id);
        if (!p) return res.status(404).json({ error: 'Not found' });
        let colors = []; try { colors = JSON.parse(req.body.colors || '[]'); } catch (e) { colors = p.colors; }
        let sizes = []; try { sizes = JSON.parse(req.body.sizes || '[]'); } catch (e) { sizes = p.sizes; }
        const urls = req.files?.map(f => f.path) || [];
        if (urls.length > 0 && colors.length > 0) {
            const per = Math.ceil(urls.length / colors.length);
            colors.forEach((c, i) => { if (!c.images) c.images = []; c.images = [...c.images, ...urls.slice(i * per, (i + 1) * per)]; });
        }
        p.set({
            name: req.body.name || p.name, description: req.body.description || p.description,
            category: req.body.category || p.category, basePrice: parseFloat(req.body.basePrice) || p.basePrice,
            sizes: sizes.length ? sizes : p.sizes, colors: colors.length ? colors : p.colors,
            isFeatured: req.body.isFeatured === 'true' || p.isFeatured, discount: parseFloat(req.body.discount) || 0,
            promotion: req.body.promotionStartDate ? { startDate: req.body.promotionStartDate, endDate: req.body.promotionEndDate } : p.promotion,
            updatedAt: new Date()
        });
        await p.save(); res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/products/:id', async (req, res) => { try { await Product.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// ORDERS
app.get('/api/orders', async (req, res) => { try { res.json(await Order.find().sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/orders/:orderNumber', async (req, res) => {
    try { const o = await Order.findOne({ orderNumber: req.params.orderNumber }); o ? res.json(o) : res.status(404).json({ error: 'Not found' }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/orders', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const products = await Product.find();
        const orderNumber = generateOrderNumber();
        const deliveryFee = settings?.deliveryFee || 15;
        let subtotal = 0;
        const items = (req.body.items || []).map(item => {
            const prod = products.find(p => p._id.toString() === item.productId);
            if (prod) {
                const col = prod.colors.find(c => c.name === item.color);
                if (col) {
                    const price = prod.discount > 0 ? prod.basePrice * (1 - prod.discount / 100) : prod.basePrice;
                    subtotal += price * item.quantity;
                    const ci = prod.colors.findIndex(c => c.name === item.color);
                    prod.colors[ci].stock = Math.max(0, col.stock - item.quantity);
                }
            }
            return { productId: item.productId, productName: item.productName, color: item.color, size: item.size, quantity: item.quantity, price: item.price };
        });
        await Promise.all(products.map(p => p.save()));
        const cd = parseFloat(req.body.couponDiscount) || 0;
        const no = new Order({
            orderNumber, customerName: req.body.customerName, customerPhone: req.body.customerPhone,
            customerEmail: req.body.customerEmail, address: req.body.address, city: req.body.city,
            postalCode: req.body.postalCode, items, subtotal, deliveryFee, couponDiscount: cd,
            total: subtotal + deliveryFee - cd, couponCode: req.body.couponCode,
            status: 'Nouveau', paymentMethod: 'COD', notes: req.body.notes
        });
        await no.save(); res.json(no);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/orders/:id', async (req, res) => {
    try {
        const o = await Order.findById(req.params.id);
        if (!o) return res.status(404).json({ error: 'Not found' });
        o.set(req.body); o.updatedAt = new Date(); await o.save(); res.json(o);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// COUPONS
app.get('/api/coupons', async (req, res) => { try { res.json(await Coupon.find()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/coupons', async (req, res) => {
    try {
        const c = new Coupon({
            code: (req.body.code || '').toUpperCase(), discount: parseFloat(req.body.discount),
            discountType: req.body.discountType || 'percentage', minOrder: parseFloat(req.body.minOrder) || 0,
            expirationDate: req.body.expirationDate, isActive: req.body.isActive !== false
        });
        await c.save(); res.json(c);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/coupons/:id', async (req, res) => { try { await Coupon.findByIdAndDelete(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code, orderTotal } = req.body;
        const c = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
        if (!c) return res.json({ valid: false, error: 'Code invalide' });
        if (c.expirationDate && new Date(c.expirationDate) < new Date()) return res.json({ valid: false, error: 'Code expiré' });
        if (orderTotal < c.minOrder) return res.json({ valid: false, error: `Minimum: ${c.minOrder} DT` });
        const d = c.discountType === 'percentage' ? orderTotal * (c.discount / 100) : c.discount;
        res.json({ valid: true, discount: d, code: c.code });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// REVIEWS
app.get('/api/reviews', async (req, res) => {
    try {
        const r = await Review.find();
        res.json(req.query.productId ? r.filter(x => x.productId === req.query.productId) : r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/reviews', async (req, res) => {
    try {
        const r = new Review({ productId: req.body.productId, customerName: req.body.customerName, rating: parseInt(req.body.rating) || 5, comment: req.body.comment });
        await r.save(); res.json(r);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ANALYTICS
app.get('/api/analytics', async (req, res) => {
    try {
        const orders = await Order.find(), products = await Product.find(), settings = await Settings.findOne();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);
        const lsp = [];
        products.forEach(p => p.colors.forEach(c => { if (c.stock <= (settings?.lowStockThreshold || 5) && c.stock > 0) lsp.push({ productName: p.name, color: c.name, stock: c.stock }); }));
        const ps = {};
        orders.forEach(o => o.items.forEach(i => { ps[i.productName] = (ps[i.productName] || 0) + i.quantity; }));
        res.json({
            totalOrders: orders.length, totalRevenue: orders.reduce((s, o) => s + o.total, 0),
            productsCount: products.length,
            pendingOrders: orders.filter(o => o.status === 'Nouveau').length,
            completedOrders: orders.filter(o => o.status === 'Livré').length,
            cancelledOrders: orders.filter(o => o.status === 'Annulé').length,
            todayRevenue: orders.filter(o => o.createdAt >= today).reduce((s, o) => s + o.total, 0),
            monthRevenue: orders.filter(o => o.createdAt >= thisMonth).reduce((s, o) => s + o.total, 0),
            yearRevenue: orders.filter(o => o.createdAt >= thisYear).reduce((s, o) => s + o.total, 0),
            lowStockProducts: lsp,
            bestSellingProducts: Object.entries(ps).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, q]) => ({ name: n, quantity: q }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// EXCEL EXPORT
app.get('/api/export/excel', async (req, res) => {
    try {
        const orders = await Order.find(), products = await Product.find(), { type } = req.query;
        const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Rapport');
        if (type === 'orders') {
            ws.columns = [{ header: 'Numéro', key: 'orderNumber', width: 20 }, { header: 'Date', key: 'date', width: 15 }, { header: 'Client', key: 'customer', width: 25 }, { header: 'Téléphone', key: 'phone', width: 15 }, { header: 'Ville', key: 'city', width: 15 }, { header: 'Statut', key: 'status', width: 15 }, { header: 'Total', key: 'total', width: 12 }];
            orders.forEach(o => ws.addRow({ orderNumber: o.orderNumber, date: o.createdAt.toLocaleDateString('fr-FR'), customer: o.customerName, phone: o.customerPhone, city: o.city, status: o.status, total: o.total }));
            ws.addRow({}); ws.addRow({ orderNumber: 'TOTAL', total: orders.reduce((s, o) => s + o.total, 0) });
        } else if (type === 'products') {
            ws.columns = [{ header: 'Nom', key: 'name', width: 30 }, { header: 'Catégorie', key: 'category', width: 15 }, { header: 'Prix', key: 'price', width: 12 }, { header: 'Stock', key: 'stock', width: 10 }];
            products.forEach(p => ws.addRow({ name: p.name, category: p.category, price: p.basePrice, stock: p.colors.reduce((s, c) => s + c.stock, 0) }));
        }
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=rapport-${type}.xlsx`);
        res.send(await wb.xlsx.writeBuffer());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// START
app.listen(PORT, () => {
    console.log(`\n🚀 Born To Shine API running on port ${PORT}`);
    console.log(`💾 MongoDB Atlas | 🖼️ Cloudinary | 🌐 Ready for Netlify`);
});
