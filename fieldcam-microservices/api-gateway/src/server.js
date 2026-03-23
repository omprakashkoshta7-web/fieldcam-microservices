const express = require('express');
const proxy = require('express-http-proxy');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

const AUTH_URL    = process.env.AUTH_SERVICE_URL    || 'http://localhost:3001';
const USER_URL    = process.env.USER_SERVICE_URL    || 'http://localhost:3002';
const PROJECT_URL = process.env.PROJECT_SERVICE_URL || 'http://localhost:3003';
const INVOICE_URL = process.env.INVOICE_SERVICE_URL || 'http://localhost:3004';

// Helper: preserve full path when proxying
const fwd = (target) => proxy(target, {
  proxyReqPathResolver: (req) => req.originalUrl,
});

// Route map
app.use('/api/auth',                fwd(AUTH_URL));
app.use('/api/admin/login',         fwd(AUTH_URL));

// Admin routes — specific services first, then fallback to user-service
app.use('/api/admin/projects',      fwd(PROJECT_URL));
app.use('/api/admin/photos',        fwd(PROJECT_URL));
app.use('/api/admin/reports',       fwd(PROJECT_URL));
app.use('/api/admin/dashboard',     fwd(PROJECT_URL));
app.use('/api/admin/invoices',      fwd(INVOICE_URL));
app.use('/api/admin/earnings',      fwd(INVOICE_URL));
app.use('/api/admin',               fwd(USER_URL));   // users, services, dashboard fallback

app.use('/api/profile',             fwd(USER_URL));
app.use('/api/team',                fwd(USER_URL));
app.use('/api/performance',         fwd(USER_URL));
app.use('/api/services',            fwd(USER_URL));
app.use('/api/projects',            fwd(PROJECT_URL));
app.use('/api/photos',              fwd(PROJECT_URL));
app.use('/api/dashboard',           fwd(PROJECT_URL));
app.use('/api/reports',             fwd(PROJECT_URL));
app.use('/api/invoices',            fwd(INVOICE_URL));
app.use('/api/earnings',            fwd(INVOICE_URL));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  services: { auth: AUTH_URL, user: USER_URL, project: PROJECT_URL, invoice: INVOICE_URL },
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
