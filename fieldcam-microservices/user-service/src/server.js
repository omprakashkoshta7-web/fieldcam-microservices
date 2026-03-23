const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(UPLOAD_DIR));

const auth      = require('./middleware/auth');
const adminAuth = require('./middleware/adminAuth');
const profile   = require('./controllers/profileController');
const team      = require('./controllers/teamController');
const perf      = require('./controllers/performanceController');
const svc       = require('./controllers/serviceController');
const admin     = require('./controllers/adminController');

// Avatar upload
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `avatar_${req.user._id}_${Date.now()}${path.extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images allowed')),
});

// Profile routes
app.get('/api/profile',          auth, profile.getProfile);
app.patch('/api/profile',        auth, profile.updateProfile);
app.post('/api/profile/avatar',  auth, avatarUpload.single('avatar'), profile.uploadAvatar);

// Team routes
app.get('/api/team',                  auth, team.getTeam);
app.post('/api/team/invite',          auth, team.inviteStaff);
app.patch('/api/team/:id/toggle',     auth, team.toggleStatus);
app.patch('/api/team/:id/assign',     auth, team.assignToProject);

// Performance
app.get('/api/performance', auth, perf.getPerformance);

// Services (public + admin)
app.get('/api/services',          auth, svc.getPublicServices);
app.get('/api/services/:id',      auth, svc.getServiceById);
app.get('/api/admin/services',    adminAuth, svc.getServices);
app.get('/api/admin/services/:id',adminAuth, svc.getServiceById);
app.post('/api/admin/services',   adminAuth, svc.createService);
app.patch('/api/admin/services/:id', adminAuth, svc.updateService);
app.delete('/api/admin/services/:id',adminAuth, svc.deleteService);

// Admin user management
app.get('/api/admin/dashboard',   adminAuth, admin.getDashboard);
app.get('/api/admin/users',       adminAuth, admin.getUsers);
app.post('/api/admin/users',      adminAuth, admin.createUser);
app.patch('/api/admin/users/:id', adminAuth, admin.updateUser);
app.delete('/api/admin/users/:id',adminAuth, admin.deleteUser);

app.get('/health', (_req, res) => res.json({ service: 'user-service', status: 'ok' }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`user-service running on port ${PORT}`));
