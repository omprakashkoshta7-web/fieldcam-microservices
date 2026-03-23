const Invoice = require('../models/Invoice');
const Project = require('../models/Project');

exports.getEarnings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;
    if (period === 'week') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(now.getFullYear(), now.getMonth(), 1);

    const [invoices, paidTotal, pendingTotal, trendRaw] = await Promise.all([
      Invoice.find({ vendor: userId, createdAt: { $gte: startDate } }).populate('project', 'projectNumber address').sort({ createdAt: -1 }),
      Invoice.aggregate([{ $match: { vendor: userId, status: 'Paid', createdAt: { $gte: startDate } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([{ $match: { vendor: userId, status: { $in: ['Submitted','Under Review','Draft'] }, createdAt: { $gte: startDate } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([
        { $match: { vendor: userId, createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    let trend = trendRaw;
    if (trend.length === 0) {
      const pt = await Project.aggregate([
        { $match: { assignedTo: userId, payment: { $gt: 0 } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$payment' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]);
      trend = pt;
    }

    const finalPaid = paidTotal[0]?.total || 0;
    const finalPending = pendingTotal[0]?.total || 0;

    res.json({
      paid: finalPaid, pending: finalPending, total: finalPaid + finalPending,
      trend: trend.length > 0 ? trend.map(t => ({ month: t._id.month, year: t._id.year, amount: t.total })) : [
        { month: 1, amount: 320 }, { month: 2, amount: 450 }, { month: 3, amount: 380 },
        { month: 4, amount: 520 }, { month: 5, amount: 610 }, { month: 6, amount: 480 },
      ],
      transactions: invoices.map(inv => ({ id: inv.invoiceNumber, projectNumber: inv.project?.projectNumber || 'N/A', address: inv.project?.address || '', amount: inv.total, status: inv.status, date: inv.createdAt, method: 'Bank Transfer' })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const invoices = await Invoice.find({ vendor: req.user._id }).populate('project', 'projectNumber address').sort({ createdAt: -1 });
    res.json(invoices.map(inv => ({ id: inv.invoiceNumber, projectNumber: inv.project?.projectNumber || 'N/A', address: inv.project?.address || '', amount: inv.total, status: inv.status, date: inv.createdAt, method: 'Bank Transfer' })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
