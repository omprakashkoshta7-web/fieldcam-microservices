const mongoose = require('mongoose');

// Service model inline (only in user-service)
const photoChecklistItemSchema = new mongoose.Schema({
  label: { type: String, required: true },
  required: { type: Boolean, default: true },
  shotType: { type: String, enum: ['Wide Angle', 'Close Up', 'High Detail', 'Standard'], default: 'Standard' },
}, { _id: true });

const serviceSchema = new mongoose.Schema({
  category: { type: String, required: true },
  name: { type: String, required: true },
  defaultPrice: { type: Number, default: 0 },
  photoChecklist: [photoChecklistItemSchema],
  workflowRules: {
    serviceLogic: { type: String, default: '' },
    requireSignature: { type: Boolean, default: true },
    autoApproveInvoices: { type: Boolean, default: false },
    notifyClientOnDispatch: { type: Boolean, default: true },
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Service = mongoose.models.Service || mongoose.model('Service', serviceSchema);

exports.getServices = async (req, res) => {
  try { res.json(await Service.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getServiceById = async (req, res) => {
  try {
    const s = await Service.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Service not found' });
    res.json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createService = async (req, res) => {
  try { res.status(201).json(await Service.create(req.body)); }
  catch (err) { res.status(400).json({ message: err.message }); }
};

exports.updateService = async (req, res) => {
  try {
    const s = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!s) return res.status(404).json({ message: 'Service not found' });
    res.json(s);
  } catch (err) { res.status(400).json({ message: err.message }); }
};

exports.deleteService = async (req, res) => {
  try { await Service.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getPublicServices = async (req, res) => {
  try { res.json(await Service.find({ isActive: true }).select('category name defaultPrice photoChecklist')); }
  catch (err) { res.status(500).json({ message: err.message }); }
};
