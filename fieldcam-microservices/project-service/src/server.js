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
const projects  = require('./controllers/projectController');
const adminProj = require('./controllers/adminProjectController');
const dashboard = require('./controllers/dashboardController');
const reports   = require('./controllers/reportsController');
const photos    = require('./controllers/photoController');

// Multer configs
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2)}${path.extname(file.originalname) || '.jpg'}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Vendor project routes
app.get('/api/projects',              auth, projects.getProjects);
app.get('/api/projects/:id',          auth, projects.getProjectById);
app.patch('/api/projects/:id/accept', auth, projects.acceptProject);
app.patch('/api/projects/:id/reject', auth, projects.rejectProject);
app.patch('/api/projects/:id/submit', auth, projects.submitProject);

// Dashboard & reports
app.get('/api/dashboard', auth, dashboard.getDashboard);
app.get('/api/reports',   auth, reports.getReports);

// Photo routes
app.post('/api/photos/quality-check', auth, memUpload.single('photo'), photos.qualityCheck);
app.post('/api/photos/upload',        auth, diskUpload.single('photo'), photos.uploadPhoto);

// Admin project routes
app.get('/api/admin/projects',              adminAuth, adminProj.getProjects);
app.get('/api/admin/projects/:id',          adminAuth, adminProj.getProjectById);
app.post('/api/admin/projects',             adminAuth, adminProj.createProject);
app.patch('/api/admin/projects/:id',        adminAuth, adminProj.updateProject);
app.patch('/api/admin/projects/:id/approve',adminAuth, adminProj.approveProject);
app.patch('/api/admin/projects/:id/reject', adminAuth, adminProj.rejectProject);
app.patch('/api/admin/projects/:id/assign', adminAuth, adminProj.assignProject);
app.delete('/api/admin/projects/:id',       adminAuth, adminProj.deleteProject);
app.get('/api/admin/photos',                adminAuth, adminProj.getPhotos);
app.patch('/api/admin/photos/:id/status',   adminAuth, adminProj.updatePhotoStatus);
app.delete('/api/admin/photos/:id',         adminAuth, adminProj.deletePhoto);
app.get('/api/admin/reports',               adminAuth, reports.getAdminReports);

app.get('/health', (_req, res) => res.json({ service: 'project-service', status: 'ok' }));

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`project-service running on port ${PORT}`));
