const Project = require('../models/Project');
const Photo = require('../models/Photo');

exports.getProjects = async (req, res) => {
  try {
    const { status, search } = req.query;
    const userId = req.user._id;
    const q = { $or: [{ assignedTo: userId }, { vendorId: userId }] };
    if (status && status !== 'All') q.status = status;
    if (search) q.$and = [{ $or: [
      { projectNumber: { $regex: search, $options: 'i' } },
      { address: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
    ]}];

    let projects = await Project.find(q).sort({ createdAt: -1 });
    if (projects.length === 0) {
      const fallback = { $or: [{ assignedTo: userId }, { assignedTo: { $exists: false } }, { assignedTo: null }] };
      if (status && status !== 'All') fallback.status = status;
      projects = await Project.find(fallback).sort({ createdAt: -1 });
    }
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    let project = await Project.findOne({ _id: req.params.id, assignedTo: req.user._id });
    if (!project) project = await Project.findOne({ _id: req.params.id, $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }] });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const photos = await Photo.find({ project: project._id });
    res.json({ ...project.toObject(), photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptProject = async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, assignedTo: req.user._id, status: 'Assigned' },
      { status: 'Accepted' }, { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found or already accepted' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectProject = async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, assignedTo: req.user._id },
      { status: 'Rejected', rejectionReason: req.body.reason || '' }, { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitProject = async (req, res) => {
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, assignedTo: req.user._id },
      { status: 'Submitted', submittedAt: new Date() }, { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
