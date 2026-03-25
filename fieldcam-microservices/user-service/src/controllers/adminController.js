const mongoose = require('mongoose');
const User = require('../models/User');
const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');
const bcrypt = require('bcryptjs');

exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const assignedVendorIds = await Project.distinct('assignedTo', { assignedTo: { $ne: null } });

    const [totalVendors, activeVendors, totalProjects, activeProjects, completedProjects,
      pendingReview, totalPhotos, totalRevenue, monthRevenue, recentProjects, recentUsers] = await Promise.all([
      User.countDocuments({ role: { $in: ['vendor', 'staff'] }, _id: { $in: assignedVendorIds } }),
      User.countDocuments({ role: { $in: ['vendor', 'staff'] }, isActive: true, _id: { $in: assignedVendorIds } }),
      Project.countDocuments(),
      Project.countDocuments({ status: { $in: ['Accepted', 'In Progress'] } }),
      Project.countDocuments({ status: { $in: ['Approved', 'Completed'] } }),
      Project.countDocuments({ status: { $in: ['Submitted', 'Under Review'] } }),
      Photo.countDocuments(),
      Invoice.aggregate([{ $match: { status: 'Paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Invoice.aggregate([{ $match: { status: 'Paid', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Project.find().sort({ updatedAt: -1 }).limit(8).populate('assignedTo', 'profile.name email phone').select('projectNumber title status priority payment deadline address updatedAt'),
      User.find({ role: { $in: ['vendor', 'staff'] }, _id: { $in: assignedVendorIds } }).sort({ createdAt: -1 }).limit(5).select('profile email phone role isActive createdAt'),
    ]);

    const trend = await Invoice.aggregate([
      { $match: { status: 'Paid', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$total' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const statusBreakdown = await Project.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);

    const vendorPerfAgg = await Project.aggregate([
      { $match: { assignedTo: { $in: assignedVendorIds } } },
      { $group: {
        _id: '$assignedTo',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Approved']] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] } },
        onTime: { $sum: { $cond: [
          { $and: [
            { $in: ['$status', ['Completed', 'Approved']] },
            { $lte: ['$submittedAt', '$deadline'] }
          ]}, 1, 0
        ]}},
      }},
    ]);
    const vendorUserDocs = await User.find({ _id: { $in: vendorPerfAgg.map(v => v._id) } }).select('profile.name email');
    const vendorMap = Object.fromEntries(vendorUserDocs.map(u => [u._id.toString(), u]));
    const vendorPerformance = vendorPerfAgg.map(v => {
      const u = vendorMap[v._id.toString()];
      // Realistic score: completion rate (60%) + no-rejection bonus (25%) + on-time bonus (15%)
      const completionRate = v.total > 0 ? (v.completed / v.total) : 0;
      const rejectionPenalty = v.total > 0 ? (v.rejected / v.total) : 0;
      const onTimeRate = v.completed > 0 ? (v.onTime / v.completed) : 0;
      // Base: 50 + completion contribution + ontime bonus - rejection penalty
      const rawScore = 50 + (completionRate * 30) + (onTimeRate * 15) - (rejectionPenalty * 20);
      const score = Math.min(98, Math.max(10, Math.round(rawScore)));
      return { name: u?.profile?.name || u?.email || 'Vendor', completed: v.completed, total: v.total, score };
    }).sort((a, b) => b.score - a.score);

    res.json({
      stats: { totalVendors, activeVendors, totalProjects, activeProjects, completedProjects, pendingReview,
        totalPhotos, totalRevenue: totalRevenue[0]?.total || 0, monthRevenue: monthRevenue[0]?.total || 0 },
      trend: trend.map(t => ({ month: t._id.month, year: t._id.year, amount: t.total })),
      statusBreakdown, recentProjects, recentUsers, vendorPerformance,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20, hasProjects } = req.query;
    const query = {};
    if (role) query.role = role;
    if (search) query.$or = [
      { 'profile.name': { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];

    // Filter: only vendors who have at least one project assigned
    if (hasProjects === 'true') {
      const assignedIds = await Project.distinct('assignedTo', { assignedTo: { $ne: null } });
      query._id = { $in: assignedIds };
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-otp -otpExpiry'),
      User.countDocuments(query),
    ]);

    // Attach real per-vendor stats
    const userIds = users.map(u => new mongoose.Types.ObjectId(u._id));
    const [projectStats, approvedStats, activeStats, totalStats] = await Promise.all([
      Project.aggregate([
        { $match: { assignedTo: { $in: userIds }, status: { $in: ['Completed', 'Approved'] } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { assignedTo: { $in: userIds }, status: 'Approved' } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { assignedTo: { $in: userIds }, status: { $nin: ['Completed', 'Approved', 'Rejected'] } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      Project.aggregate([
        { $match: { assignedTo: { $in: userIds } } },
        { $group: { _id: '$assignedTo', total: { $sum: 1 } } },
      ]),
    ]);

    const toMap = arr => Object.fromEntries(arr.map(x => [x._id.toString(), x.count ?? x.total]));
    const completedMap = toMap(projectStats);
    const approvedMap  = toMap(approvedStats);
    const activeMap    = toMap(activeStats);
    const totalMap     = toMap(totalStats);

    const usersWithStats = users.map(u => {
      const uid = u._id.toString();
      const totalProjects = totalMap[uid] || 0;
      const completed     = completedMap[uid] || 0;
      const approved      = approvedMap[uid] || 0;
      const active        = activeMap[uid] || 0;
      const approvalRate  = totalProjects > 0 ? Math.round((approved / totalProjects) * 100) : 0;
      return { ...u.toObject(), stats: { completed, active, approvalRate, totalProjects } };
    });

    res.json({ users: usersWithStats, total, page: Number(page), pages: Math.ceil(total / limit) });
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

exports.updateAdminProfile = async (req, res) => {
  try {
    const { name, company, address, phone } = req.body;
    const update = {};
    if (name    !== undefined) update['profile.name']    = name;
    if (company !== undefined) update['profile.company'] = company;
    if (address !== undefined) update['profile.address'] = address;
    if (phone   !== undefined) update.phone = phone;

    // Hardcoded admin fallback — no DB record
    if (String(req.user?._id) === 'admin_hardcoded') {
      return res.json({
        id: 'admin_hardcoded',
        email: 'admin@fieldworkcam.com',
        role: 'admin',
        phone: phone || '',
        profile: { name: name || 'Admin', company: company || 'FieldWork Cam', address: address || '' },
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true }
    ).select('-otp -otpExpiry -password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
