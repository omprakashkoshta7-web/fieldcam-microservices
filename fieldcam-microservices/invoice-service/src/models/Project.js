const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectNumber: { type: String, unique: true },
  title: String,
  address: String,
  client: String,
  payment: { type: Number, default: 0 },
  status: { type: String, default: 'Assigned' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
