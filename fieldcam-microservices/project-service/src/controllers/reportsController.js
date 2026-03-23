const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');

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
    const [projectStats, invoiceStats, photoStats, topVendors] = await Promise.all([
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
    res.json({ projectStats, invoiceStats, photoStats, topVendors });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
