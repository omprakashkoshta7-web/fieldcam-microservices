const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectNumber: { type: String, unique: true },
  title: { type: String, required: true },
  address: { type: String, required: true },
  client: String,
  instructions: String,
  deadline: Date,
  payment: { type: Number, default: 0 },
  priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
  status: {
    type: String,
    enum: ['Assigned','Accepted','In Progress','Submitted','Under Review','Approved','Rejected','Completed'],
    default: 'Assigned',
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vendorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  requiredCategories: [String],
  rejectionReason: String,
  submittedAt: Date,
  approvedAt: Date,
  image: String,
}, { timestamps: true });

projectSchema.pre('save', async function (next) {
  if (!this.projectNumber) {
    const count = await mongoose.model('Project').countDocuments();
    this.projectNumber = `PRJ-${String(count + 1001).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Project', projectSchema);
