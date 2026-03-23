const User = require('../models/User');
const Project = require('../models/Project');
const Photo = require('../models/Photo');
const Invoice = require('../models/Invoice');

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const [completedJobs, totalPhotos, earnedAgg, approvedProjects, totalProjects, activeProjects] = await Promise.all([
      Project.countDocuments({ assignedTo: userId, status: { $in: ['Completed', 'Approved'] } }),
      Photo.countDocuments({ uploadedBy: userId }),
      Invoice.aggregate([{ $match: { vendor: userId, status: { $in: ['Paid', 'Approved'] } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Project.countDocuments({ assignedTo: userId, status: 'Approved' }),
      Project.countDocuments({ assignedTo: userId }),
      Project.countDocuments({ assignedTo: userId, status: { $nin: ['Completed', 'Approved', 'Rejected'] } }),
    ]);

    const approvalRate = totalProjects > 0 ? Math.round((approvedProjects / totalProjects) * 100) : 0;

    res.json({
      id: req.user._id,
      phone: req.user.phone,
      email: req.user.email,
      role: req.user.role,
      profile: req.user.profile || {},
      stats: {
        completedJobs,
        totalPhotos,
        totalEarned: earnedAgg[0]?.total || 0,
        approvalRate,
        activeProjects,
        totalProjects,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const host = process.env.SERVER_HOST || req.headers['x-forwarded-host'] || req.headers.host;
    const avatarUrl = `${req.protocol}://${host}/uploads/${req.file.filename}`;
    await User.findByIdAndUpdate(req.user._id, { 'profile.avatar': avatarUrl });
    res.json({ avatarUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, company, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { 'profile.name': name, 'profile.company': company, 'profile.address': address },
      { new: true }
    ).select('-otp -otpExpiry');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
