const Project = require('../models/Project');
const Photo   = require('../models/Photo');
const Invoice = require('../models/Invoice');

exports.getPerformance = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = 'monthly' } = req.query;
    const now = new Date();

    let startDate;
    if (period === 'weekly') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    else if (period === 'yearly') startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalProjects, completedProjects, approvedProjects, rejectedProjects, inReviewProjects,
      totalPhotos, approvedPhotos, rejectedPhotos, onTimeProjects, avgTimeAgg] = await Promise.all([
      Project.countDocuments({ assignedTo: userId, createdAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: { $in: ['Completed','Approved'] }, updatedAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: 'Approved', updatedAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: 'Rejected', updatedAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: 'Under Review', updatedAt: { $gte: startDate } }),
      Photo.countDocuments({ uploadedBy: userId, createdAt: { $gte: startDate } }),
      Photo.countDocuments({ uploadedBy: userId, 'aiValidation.passed': true, createdAt: { $gte: startDate } }),
      Photo.countDocuments({ uploadedBy: userId, 'aiValidation.passed': false, createdAt: { $gte: startDate } }),
      Project.countDocuments({ assignedTo: userId, status: { $in: ['Completed','Approved'] }, $expr: { $lte: ['$submittedAt','$deadline'] }, updatedAt: { $gte: startDate } }),
      Project.aggregate([
        { $match: { assignedTo: userId, status: { $in: ['Completed','Approved'] }, submittedAt: { $exists: true } } },
        { $project: { diffDays: { $divide: [{ $subtract: ['$submittedAt','$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$diffDays' } } },
      ]),
    ]);

    const approvalRate  = totalProjects > 0 ? Math.round((approvedProjects / totalProjects) * 100) : 0;
    const onTimeRate    = completedProjects > 0 ? Math.round((onTimeProjects / completedProjects) * 100) : 0;
    const photoPassRate = totalPhotos > 0 ? Math.round((approvedPhotos / totalPhotos) * 100) : 0;
    const avgTime       = avgTimeAgg[0] ? Math.round(avgTimeAgg[0].avg * 10) / 10 : 0;

    const [qualityAgg, gpsValid, trendAgg] = await Promise.all([
      Photo.aggregate([{ $match: { uploadedBy: userId, createdAt: { $gte: startDate } } }, { $group: { _id: null, avg: { $avg: '$aiValidation.qualityScore' } } }]),
      Photo.countDocuments({ uploadedBy: userId, 'aiValidation.gpsValid': true, createdAt: { $gte: startDate } }),
      Project.aggregate([
        { $match: { assignedTo: userId, status: { $in: ['Completed','Approved'] }, updatedAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
        { $group: { _id: { month: { $month: '$updatedAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.month': 1 } },
      ]),
    ]);

    const avgQualityScore = qualityAgg[0] ? Math.round(qualityAgg[0].avg) : 0;
    const gpsAccuracy = totalPhotos > 0 ? Math.round((gpsValid / totalPhotos) * 100) : 0;

    const scoreBreakdown = [
      { label: 'Photo Quality',       pct: photoPassRate || avgQualityScore || 0 },
      { label: 'Timeliness',          pct: onTimeRate || 0 },
      { label: 'GPS Accuracy',        pct: gpsAccuracy || 0 },
      { label: 'Documentation',       pct: completedProjects > 0 ? Math.min(Math.round((completedProjects / Math.max(totalProjects, 1)) * 100), 100) : 0 },
      { label: 'Client Satisfaction', pct: approvalRate || 0 },
    ];
    const overallScore = Math.round(scoreBreakdown.reduce((s, b) => s + b.pct, 0) / scoreBreakdown.length);

    res.json({
      stats: { totalPhotos, totalProjects, approvalRate, onTimeRate, avgTime, overallScore,
        approved: approvedPhotos, inReview: inReviewProjects, rejected: rejectedPhotos,
        workQuality: avgQualityScore || photoPassRate, completedJobs: completedProjects, satisfactionPct: approvalRate },
      trend: trendAgg.map(t => ({ month: t._id.month, amount: t.count })),
      scoreBreakdown,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
