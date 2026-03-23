const User = require('../models/User');
const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');
const bcrypt = require('bcryptjs');

exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalVendors, activeVendors, totalProjects, activeProjects, completedProjects,
      pendingReview, totalPhotos, totalRevenue, monthRevenue, recentProjects, recentUsers] = await Promise.all([
      User.countDocuments({ role: { $in: ['vendor', 'staff'] } }),
      User.countDocuments({ role: { $in: ['vendor', 'staff'] }, isActive: true }),
      Project.countDocuments(),
      Project.countDocuments({ status: { $in: ['Accepted', 'In Progress'] } }),
      Project.countDocuments({ status: { $in: ['Approved', 'Completed'] } }),
      Project.countDocuments({ status: { $in: ['Submitted', 'Under Review'] } }),
      Photo.countDocuments(),
      Invoice.aggregate([{ $match: { status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([{ $match: { status: 'Paid', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Project.find().sort({ updatedAt: -1 }).limit(8).populate('assignedTo', 'profile.name email phone').select('projectNumber title status priority payment deadline address updatedAt'),
      User.find({ role: { $in: ['vendor', 'staff'] } }).sort({ createdAt: -1 }).limit(5).select('profile email phone role isActive createdAt'),
    ]);

    const trend = await Invoice.aggregate([
      { $match: { status: 'Paid', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const statusBreakdown = await Project.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

    res.json({
      stats: { totalVendors, activeVendors, totalProjects, activeProjects, completedProjects, pendingReview,
        totalPhotos, totalRevenue: totalRevenue[0]?.total || 0, monthRevenue: monthRevenue[0]?.total || 0 },
      trend: trend.map(t => ({ month: t._id.month, year: t._id.year, amount: t.total })),
      statusBreakdown, recentProjects, recentUsers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [
      { 'profile.name': { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-otp -otpExpiry'),
      User.countDocuments(query),
    ]);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, phone, role, name, company, password } = req.body;
    const hashed = password ? await bcrypt.hash(password, 10) : undefined;
    const user = await User.create({ email, phone, role: role || 'vendor', isVerified: true, password: hashed, profile: { name, company } });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, company, role, isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { $set: { 'profile.name': name, 'profile.company': company, role, isActive } }, { new: true }).select('-otp -otpExpiry');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
