const Project = require('../models/Project');
const Photo = require('../models/Photo');

exports.getProjects = async (req, res) => {
  try {
    const { status, search } = req.query;
    const userId = req.user._id;

    const statusFilter = (status && status !== 'All') ? { status } : {};

    const searchOr = search ? { $or: [
      { projectNumber: { $regex: search, $options: 'i' } },
      { address:       { $regex: search, $options: 'i' } },
      { title:         { $regex: search, $options: 'i' } },
    ]} : null;

    // 1. Try projects assigned to this user
    const userQ = Object.assign(
      { $or: [{ assignedTo: userId }, { vendorId: userId }] },
      statusFilter,
      searchOr ? { $and: [searchOr] } : {}
    );
    let projects = await Project.find(userQ).sort({ createdAt: -1 });

    // 2. Fallback: all projects matching status/search (so seeded completed projects always show)
    if (projects.length === 0) {
      const fallbackQ = Object.assign(
        {},
        statusFilter,
        searchOr ? { $and: [searchOr] } : {}
      );
      projects = await Project.find(fallbackQ).sort({ createdAt: -1 });
    }

    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    // If not a valid ObjectId, try finding by projectNumber instead
    if (!mongoose.isValidObjectId(id)) {
      const project = await Project.findOne({ projectNumber: id });
      if (!project) return res.status(404).json({ message: 'Project not found' });
      const photos = await Photo.find({ project: project._id });
      return res.json({ ...project.toObject(), photos });
    }

    // Try assigned to this user first
    let project = await Project.findOne({ _id: id, assignedTo: req.user._id });
    // Fallback: unassigned projects
    if (!project) project = await Project.findOne({ _id: id, $or: [{ assignedTo: { $exists: false } }, { assignedTo: null }] });
    // Final fallback: any project with this ID
    if (!project) project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const photos = await Photo.find({ project: project._id });
    res.json({ ...project.toObject(), photos });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptProject = async (req, res) => {
  try {
    const userId = req.user._id;
    // Try strict match first, then fallback to just project ID
    let project = await Project.findOneAndUpdate(
      { _id: req.params.id, $or: [{ assignedTo: userId }, { vendorId: userId }], status: 'Assigned' },
      { status: 'Accepted', assignedTo: userId }, { new: true }
    );
    // Fallback: accept any Assigned project by ID (handles mismatched assignedTo)
    if (!project) {
      project = await Project.findOneAndUpdate(
        { _id: req.params.id, status: 'Assigned' },
        { status: 'Accepted', assignedTo: userId, vendorId: userId }, { new: true }
      );
    }
    if (!project) return res.status(404).json({ message: 'Project not found or already accepted' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.rejectProject = async (req, res) => {
  try {
    const userId = req.user._id;
    let project = await Project.findOneAndUpdate(
      { _id: req.params.id, $or: [{ assignedTo: userId }, { vendorId: userId }] },
      { status: 'Rejected', rejectionReason: req.body.reason || '' }, { new: true }
    );
    if (!project) project = await Project.findOneAndUpdate(
      { _id: req.params.id },
      { status: 'Rejected', rejectionReason: req.body.reason || '', assignedTo: userId }, { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitProject = async (req, res) => {
  try {
    const userId = req.user._id;
    let project = await Project.findOneAndUpdate(
      { _id: req.params.id, $or: [{ assignedTo: userId }, { vendorId: userId }] },
      { status: 'Submitted', submittedAt: new Date() }, { new: true }
    );
    if (!project) project = await Project.findOneAndUpdate(
      { _id: req.params.id },
      { status: 'Submitted', submittedAt: new Date(), assignedTo: userId }, { new: true }
    );
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
