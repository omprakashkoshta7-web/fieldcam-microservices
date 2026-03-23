const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));

const auth      = require('./middleware/auth');
const adminAuth = require('./middleware/adminAuth');
const inv       = require('./controllers/invoiceController');
const pdf       = require('./controllers/invoicePdfController');
const earnings  = require('./controllers/earningsController');

// Vendor invoice routes
app.get('/api/invoices',              auth, inv.getInvoices);
app.get('/api/invoices/:id/pdf',      auth, pdf.downloadPdf);
app.get('/api/invoices/:id',          auth, inv.getInvoiceById);
app.post('/api/invoices',             auth, inv.createInvoice);
app.patch('/api/invoices/:id',        auth, inv.updateInvoice);
app.patch('/api/invoices/:id/submit', auth, inv.submitInvoice);

// Earnings
app.get('/api/earnings',          auth, earnings.getEarnings);
app.get('/api/earnings/payments', auth, earnings.getPayments);

// Admin invoice routes
app.get('/api/admin/invoices',              adminAuth, inv.getAdminInvoices);
app.post('/api/admin/invoices',             adminAuth, inv.createAdminInvoice);
app.patch('/api/admin/invoices/:id/status', adminAuth, inv.updateInvoiceStatus);
app.delete('/api/admin/invoices/:id',       adminAuth, inv.deleteInvoice);

app.get('/health', (_req, res) => res.json({ service: 'invoice-service', status: 'ok' }));

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => console.log(`invoice-service running on port ${PORT}`));
