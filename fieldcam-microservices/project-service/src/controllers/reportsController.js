const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

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
