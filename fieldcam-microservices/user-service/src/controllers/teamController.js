const User = require('../models/User');
const Project = require('../models/Project');

exports.getTeam = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const members = await User.find({ vendorId, _id: { $ne: vendorId }, role: { $in: ['vendor', 'staff'] } })
      .select('phone email role profile isActive createdAt vendorId').lean();

    const ids = members.map(m => m._id);
    const [counts, completedCounts] = await Promise.all([
      Project.aggregate([{ $match: { assignedTo: { $in: ids }, status: { $nin: ['Completed','Rejected','Approved'] } } }, { $group: { _id: '$assignedTo', count: { $sum: 1 } } }]),
      Project.aggregate([{ $match: { assignedTo: { $in: ids }, status: { $in: ['Completed','Approved'] } } }, { $group: { _id: '$assignedTo', count: { $sum: 1 } } }]),
    ]);

    const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
    const doneMap  = Object.fromEntries(completedCounts.map(c => [String(c._id), c.count]));

    res.json(members.map(m => ({
      _id: m._id, name: m.profile?.name || 'Unknown', phone: m.phone || '',
      email: m.email || '', role: m.role, company: m.profile?.company || '',
      isActive: m.isActive, projects: countMap[String(m._id)] || 0,
      completedProjects: doneMap[String(m._id)] || 0, createdAt: m.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.inviteStaff = async (req, res) => {
  try {
    const { name, phone, email, role } = req.body;
    if (!name || !phone) return res.status(400).json({ message: 'Name and phone required' });
    if (await User.findOne({ phone })) return res.status(409).json({ message: 'User with this phone already exists' });

    const user = await User.create({
      phone, email: email || undefined,
      role: role === 'staff' ? 'staff' : 'vendor',
      isActive: true, profile: { name }, vendorId: req.user._id,
    });
    res.status(201).json({ _id: user._id, name: user.profile.name, phone: user.phone, email: user.email || '', role: user.role, isActive: user.isActive, projects: 0, completedProjects: 0 });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, $or: [{ _id: req.user._id }, { vendorId: req.user._id }] });
    if (!user) return res.status(404).json({ message: 'Staff member not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignToProject = async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ message: 'projectId required' });

    const staff = await User.findOne({ _id: req.params.id, $or: [{ _id: req.user._id }, { vendorId: req.user._id }] });
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });

    const project = await Project.findOne({ _id: projectId, $or: [{ vendorId: req.user._id }, { assignedTo: req.user._id }] });
    if (!project) return res.status(404).json({ message: 'Project not found or not assigned to you' });

    if (!project.vendorId) project.vendorId = req.user._id;
    project.assignedTo = staff._id;
    project.status = project.status === 'Assigned' ? 'Accepted' : project.status;
    await project.save();

    res.json({ message: 'Staff assigned to project', project: { _id: project._id, title: project.title, status: project.status } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
