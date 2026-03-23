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

const { login, verifyOTP, adminLogin } = require('./controllers/authController');

app.post('/api/auth/login', login);
app.post('/api/auth/verify-otp', verifyOTP);
app.post('/api/admin/login', adminLogin);

app.get('/health', (_req, res) => res.json({ service: 'auth-service', status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));
