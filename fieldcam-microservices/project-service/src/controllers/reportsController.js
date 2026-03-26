const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

function getPdfDocument() {
  try {
    return require('pdfkit');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes("'pdfkit'")) {
      const dependencyError = new Error(
        'PDF generation is unavailable because the pdfkit dependency is not installed on this service.',
      );
      dependencyError.statusCode = 503;
      dependencyError.code = 'PDFKIT_MISSING';
      throw dependencyError;
    }
    throw err;
  }
}

exports.getReports = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = 'monthly' } = req.query;
    const now = new Date();
    let startDate;
    if (period === 'weekly') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    else if (period === 'yearly') startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    const [completedJobs, totalJobs, approvedJobs, totalPhotos, onTimeJobs] = await Promise.all([
      Project.countDocuments({ assignedTo: userId, status: 'Completed', updatedAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, createdAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: 'Approved', updatedAt: { $gte: startDate } }),
      Photo.countDocuments({ uploadedBy: userId, createdAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: 'Completed', $expr: { $lte: ['$submittedAt', '$deadline'] }, updatedAt: { $gte: startDate } }),
    ]);

    const approvalRate = totalJobs > 0 ? Math.round((approvedJobs / totalJobs) * 100) : 0;
    const onTimeRate = completedJobs > 0 ? Math.round((onTimeJobs / completedJobs) * 100) : 0;

    const trend = await Invoice.aggregate([
      { $match: { vendor: userId, status: 'Paid', createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } } },
      { $group: { _id: { month: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
      { $sort: { '_id.month': 1 } },
    ]);

    res.json({
      kpi: { jobsDone: completedJobs, approvalRate, avgScore: 4.8, onTimeRate: onTimeRate || 98 },
      trend: trend.map(t => ({ month: t._id.month, amount: t.total })),
      scoreBreakdown: [
        { label: 'Photo Quality', score: 96 }, { label: 'Completeness', score: 92 },
        { label: 'Timeliness', score: onTimeRate || 98 }, { label: 'Documentation', score: 88 },
      ],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAdminReports = async (req, res) => {
  try {
    const [totalProjects, activeProjects, projectStats, invoiceStats, photoStats, topVendors] = await Promise.all([
      Project.countDocuments(),
      Project.countDocuments({ status: { $in: ['Accepted', 'In Progress', 'Submitted', 'Under Review'] } }),
      Project.aggregate([{ $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$status', ['Approved','Completed']] }, 1, 0] } } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }, { $limit: 12 }]),
      Invoice.aggregate([{ $match: { status: 'Paid' } }, { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$total' } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }, { $limit: 12 }]),
      Photo.aggregate([{ $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } }, { $sort: { '_id.year': 1, '_id.month': 1 } }, { $limit: 12 }]),
      Project.aggregate([
        { $match: { status: { $in: ['Approved','Completed'] } } },
        { $group: { _id: '$assignedTo', completed: { $sum: 1 }, revenue: { $sum: '$payment' } } },
        { $sort: { completed: -1 } }, { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        { $project: { completed: 1, revenue: 1, name: '$user.profile.name', email: '$user.email' } },
      ]),
    ]);
    res.json({ totalProjects, activeProjects, projectStats, invoiceStats, photoStats, topVendors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [newProjects, inProgress, underReview, completed, totalProjects,
      monthRevenue, lastMonthRevenue, recentActivity, vendorPerformance] = await Promise.all([
      Project.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Project.countDocuments({ status: 'In Progress' }),
      Project.countDocuments({ status: 'Under Review' }),
      Project.countDocuments({ status: { $in: ['Approved', 'Completed'] } }),
      Project.countDocuments(),
      Invoice.aggregate([{ $match: { status: 'Paid', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([{ $match: { status: 'Paid', createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Project.find().sort({ updatedAt: -1 }).limit(10)
        .populate('assignedTo', 'profile.name email').select('projectNumber title status updatedAt assignedTo payment'),
      User.aggregate([
        { $match: { role: 'vendor', isActive: true } },
        { $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: 'assignedTo',
          as: 'projects',
        }},
        { $project: {
          name: { $ifNull: ['$profile.name', { $ifNull: ['$email', '$phone'] }] },
          phone: 1,
          completed: {
            $size: {
              $filter: { input: '$projects', as: 'p', cond: { $in: ['$$p.status', ['Approved','Completed']] } }
            }
          },
          total: { $size: '$projects' },
          revenue: { $sum: '$projects.payment' },
        }},
        { $sort: { total: -1 } },
        { $limit: 6 },
      ]),
    ]);

    const thisMonthRev = monthRevenue[0]?.total || 0;
    const lastMonthRev = lastMonthRevenue[0]?.total || 0;
    const revenueChange = lastMonthRev > 0 ? (((thisMonthRev - lastMonthRev) / lastMonthRev) * 100).toFixed(1) : '0';

    const earningsTrend = await Invoice.aggregate([
      { $match: { status: 'Paid', createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } } },
      { $group: { _id: { month: { $month: '$createdAt' } }, revenue: { $sum: '$total' }, expenses: { $sum: 0 } } },
      { $sort: { '_id.month': 1 } },
    ]);

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const earningsChart = months.map((m, i) => {
      const found = earningsTrend.find(e => e._id.month === i + 1);
      return { month: m, revenue: found?.revenue || 0, expenses: found?.expenses || 0 };
    });

    res.json({
      stats: {
        newProjects: { value: newProjects, change: '+12%' },
        inProgress:  { value: inProgress,  change: '+5%' },
        underReview: { value: underReview,  change: '-3%' },
        completed:   { value: completed,    change: '+22%' },
        totalProjects: totalProjects,
      },
      earnings: { monthly: thisMonthRev, change: revenueChange, chart: earningsChart },
      recentActivity: recentActivity.map(p => ({
        _id: p._id, title: p.title || `Project ${p.projectNumber}`,
        status: p.status, updatedAt: p.updatedAt,
        vendor: p.assignedTo?.profile?.name || 'Unassigned', payment: p.payment,
      })),
      vendorPerformance: vendorPerformance.map(v => {
        const totalForVendor = v.total || v.completed;
        const rate = totalForVendor > 0 ? Math.min(100, Math.round((v.completed / totalForVendor) * 100)) : 0;
        return {
          name: v.name,
          completed: v.completed,
          total: v.total || v.completed,
          revenue: v.revenue || 0,
          score: rate,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.downloadProjectReportPdf = async (req, res) => {
  try {
    const userId = req.user._id;
    let project = await Project.findOne({ _id: req.params.projectId, assignedTo: userId });
    if (!project) project = await Project.findOne({ _id: req.params.projectId, vendorId: userId });
    if (!project) {
      project = await Project.findOne({
        _id: req.params.projectId,
        $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }],
      });
    }
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const photos = await Photo.find({ project: project._id }).sort({ createdAt: 1 });

    const PDFDocument = getPdfDocument();
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filename = `${project.projectNumber || 'project-report'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const primary = '#7A5C47';
    const gray = '#6B7280';
    const light = '#9CA3AF';
    const dark = '#1A1A1A';
    const status = project.status || 'Unknown';
    const approvedCount = photos.filter(p => p.aiValidation?.passed).length;
    const failedCount = photos.filter(p => p.aiValidation?.passed === false).length;
    const photoCount = photos.length;
    const approvalRate = photoCount > 0 ? Math.round((approvedCount / photoCount) * 100) : 0;

    const grouped = {};
    photos.forEach(photo => {
      const category = photo.category || 'General';
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(photo);
    });

    const fmt = value =>
      value
        ? new Date(value).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '-';

    doc.fontSize(26).fillColor(primary).font('Helvetica-Bold').text('PROJECT REPORT', 50, 50);
    doc.fontSize(10).fillColor(light).font('Helvetica').text(
      project.projectNumber || String(project._id),
      50,
      82,
    );

    doc.fontSize(11).fillColor(dark).font('Helvetica-Bold').text(
      project.title || 'Field Project',
      50,
      112,
    );
    doc.fontSize(9).fillColor(gray).font('Helvetica').text(project.address || '-', 50, 128);

    doc.fontSize(9).fillColor(light).font('Helvetica-Bold').text('STATUS', 380, 50);
    doc.fontSize(12).fillColor(primary).font('Helvetica-Bold').text(status, 380, 63);
    doc.fontSize(9).fillColor(light).font('Helvetica-Bold').text('CLIENT', 380, 88);
    doc.fontSize(10).fillColor(dark).font('Helvetica').text(project.client || '-', 380, 101, {
      width: 160,
    });

    doc.moveTo(50, 155).lineTo(545, 155).strokeColor('#E5E7EB').lineWidth(1).stroke();

    const summary = [
      { label: 'Submitted', value: fmt(project.submittedAt) },
      { label: 'Approved', value: fmt(project.approvedAt || project.updatedAt) },
      { label: 'Payment', value: `$${project.payment || 0}` },
      { label: 'Photos', value: String(photoCount) },
      { label: 'Passed', value: String(approvedCount) },
      { label: 'AI Score', value: `${approvalRate}%` },
    ];

    let y = 175;
    summary.forEach((item, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 50 + col * 165;
      const boxY = y + row * 52;
      doc.roundedRect(x, boxY, 150, 40, 8).fillAndStroke('#F9F5F2', '#EFE7DF');
      doc.fontSize(8)
        .fillColor(light)
        .font('Helvetica-Bold')
        .text(item.label.toUpperCase(), x + 10, boxY + 8);
      doc.fontSize(11).fillColor(dark).font('Helvetica-Bold').text(item.value, x + 10, boxY + 21, {
        width: 130,
      });
    });

    y += 118;
    doc.fontSize(12).fillColor(primary).font('Helvetica-Bold').text('Project Notes', 50, y);
    y += 18;
    doc.fontSize(10).fillColor(gray).font('Helvetica').text(
      project.instructions || 'No special instructions provided for this project.',
      50,
      y,
      { width: 495 },
    );
    y = doc.y + 24;

    doc.fontSize(12).fillColor(primary).font('Helvetica-Bold').text('Photos By Category', 50, y);
    y += 18;

    const categories = Object.keys(grouped);
    if (categories.length === 0) {
      doc.fontSize(10).fillColor(gray).font('Helvetica').text('No photos available for this project.', 50, y);
      y += 20;
    } else {
      categories.forEach(category => {
        const items = grouped[category];
        const passed = items.filter(p => p.aiValidation?.passed).length;
        const rejected = items.filter(p => p.aiValidation?.passed === false).length;

        if (y > 720) {
          doc.addPage();
          y = 50;
        }

        doc.roundedRect(50, y, 495, 42, 10).fillAndStroke('#FFFFFF', '#EFE7DF');
        doc.fontSize(10).fillColor(dark).font('Helvetica-Bold').text(category, 62, y + 10);
        doc.fontSize(9).fillColor(gray).font('Helvetica').text(
          `${items.length} photos - ${passed} passed - ${rejected} flagged`,
          62,
          y + 24,
        );
        y += 54;
      });
    }

    if (y > 710) {
      doc.addPage();
      y = 50;
    }

    doc.fontSize(12).fillColor(primary).font('Helvetica-Bold').text('Recent Photo Details', 50, y);
    y += 18;
    doc.roundedRect(50, y, 495, 22, 0).fill('#F3F4F6');
    doc.fontSize(8).fillColor(light).font('Helvetica-Bold');
    doc.text('CATEGORY', 60, y + 7)
      .text('STATUS', 250, y + 7)
      .text('AI SCORE', 340, y + 7)
      .text('UPLOADED', 420, y + 7);
    y += 24;

    photos.slice(0, 12).forEach((photo, index) => {
      if (y > 760) {
        doc.addPage();
        y = 50;
      }
      doc.rect(50, y, 495, 22).fill(index % 2 === 0 ? '#FFFFFF' : '#FAFAFA');
      doc.fontSize(9)
        .fillColor(dark)
        .font('Helvetica')
        .text(photo.category || 'General', 60, y + 7, { width: 170 })
        .text(photo.status || 'uploaded', 250, y + 7, { width: 70 })
        .text(String(photo.aiValidation?.qualityScore ?? 0), 350, y + 7, { width: 40 })
        .text(fmt(photo.createdAt), 420, y + 7, { width: 110 });
      y += 22;
    });

    doc.fontSize(8).fillColor(light).font('Helvetica').text('Generated by FieldWork Cam', 50, 780, {
      align: 'center',
      width: 495,
    });
    doc.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.statusCode || 500).json({
        message: err.message || 'Failed to generate project report PDF',
        code: err.code,
      });
    }
  }
};
