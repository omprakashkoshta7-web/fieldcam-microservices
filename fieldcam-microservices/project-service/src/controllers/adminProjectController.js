const Project = require('../models/Project');
const Photo = require('../models/Photo');
const mongoose = require('mongoose');

exports.getProjects = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;
    if (search) query.$or = [
      { projectNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
    ];
    const skip = (page - 1) * limit;
    const [projects, total] = await Promise.all([
      Project.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('assignedTo', 'profile.name email phone').populate('assignedBy', 'profile.name email'),
      Project.countDocuments(query),
    ]);
    res.json({ projects, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('assignedTo', 'profile.name email phone').populate('assignedBy', 'profile.name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const photos = await Photo.find({ project: project._id }).populate('uploadedBy', 'profile.name email').sort({ createdAt: -1 });
    res.json({ ...project.toObject(), photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const assignedBy = mongoose.isValidObjectId(req.user._id) ? req.user._id : undefined;
    const project = await Project.create({ ...req.body, ...(assignedBy && { assignedBy }) });
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('assignedTo', 'profile.name email');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { status: 'Approved', approvedAt: new Date() }, { new: true });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { status: 'Rejected', rejectionReason: req.body.reason || '' }, { new: true });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.assignProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, { assignedTo: req.body.vendorId, status: 'Assigned' }, { new: true }).populate('assignedTo', 'profile.name email phone');
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getPhotos = async (req, res) => {
  try {
    const { project, status, page = 1, limit = 24 } = req.query;
    const query = {};
    if (project) query.project = project;
    if (status) query.status = status;
    const skip = (page - 1) * limit;
    const [photos, total] = await Promise.all([
      Photo.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
        .populate('uploadedBy', 'profile.name email').populate('project', 'projectNumber title address'),
      Photo.countDocuments(query),
    ]);
    res.json({ photos, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updatePhotoStatus = async (req, res) => {
  try {
    const photo = await Photo.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true })
      .populate('uploadedBy', 'profile.name email').populate('project', 'projectNumber title');
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    res.json(photo);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    await Photo.findByIdAndDelete(req.params.id);
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
