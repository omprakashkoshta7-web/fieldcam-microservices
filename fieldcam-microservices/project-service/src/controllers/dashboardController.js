const Project = require('../models/Project');
const Invoice = require('../models/Invoice');
const Photo = require('../models/Photo');

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [activeProjects, dueTodayProjects, totalPhotos, approvedProjects, totalProjects,
      monthlyEarnings, lastMonthEarnings, recentProjects] = await Promise.all([
      Project.countDocuments({ assignedTo: userId, status: { $in: ['Accepted', 'In Progress'] } }),
      Project.countDocuments({ assignedTo: userId, deadline: { $gte: new Date(now.setHours(0,0,0,0)), $lte: new Date(now.setHours(23,59,59,999)) }, status: { $nin: ['Completed', 'Rejected'] } }),
      Photo.countDocuments({ uploadedBy: userId }),
      Project.countDocuments({ assignedTo: userId, status: 'Approved' }),
      Project.countDocuments({ assignedTo: userId }),
      Invoice.aggregate([{ $match: { vendor: userId, status: 'Paid', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([{ $match: { vendor: userId, status: 'Paid', createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Project.find({ assignedTo: userId }).sort({ updatedAt: -1 }).limit(5).select('projectNumber title status updatedAt address payment image'),
    ]);

    let thisMonth = monthlyEarnings[0]?.total || 0;
    let lastMonth = lastMonthEarnings[0]?.total || 0;

    if (thisMonth === 0) {
      const pa = await Project.aggregate([{ $match: { assignedTo: userId, status: { $in: ['Approved','Completed'] }, createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$payment' } } }]);
      thisMonth = pa[0]?.total || 0;
    }
    if (lastMonth === 0) {
      const pa = await Project.aggregate([{ $match: { assignedTo: userId, status: { $in: ['Approved','Completed'] }, createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: '$payment' } } }]);
      lastMonth = pa[0]?.total || 0;
    }

    const earningsChange = lastMonth > 0 ? (((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1) : '0';
    const approvalRate = totalProjects > 0 ? Math.round((approvedProjects / totalProjects) * 100) : 0;

    let displayProjects = recentProjects;
    if (recentProjects.length === 0) {
      displayProjects = await Project.find({ $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }] }).sort({ createdAt: -1 }).limit(5).select('projectNumber title status updatedAt address payment image');
    }

    res.json({
      user: { name: req.user.profile?.name || 'Vendor', company: req.user.profile?.company || '', avatar: req.user.profile?.avatar || '' },
      stats: { activeProjects, dueToday: dueTodayProjects, alerts: 0, totalPhotos, approvalRate, onTimeRate: 98, vendorRating: 4.8 },
      earnings: { monthly: thisMonth, change: earningsChange },
      recentActivity: displayProjects.map(p => ({ _id: p._id, title: p.title || `Project ${p.projectNumber}`, address: p.address, time: p.updatedAt, status: p.status, payment: p.payment, image: p.image || null })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
