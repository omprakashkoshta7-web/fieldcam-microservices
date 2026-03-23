const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  amount: { type: Number, required: true },
  tax: { type: Number, default: 0 },
  total: Number,
  description: String,
  billTo: String,
  vendorName: String,
  vendorEmail: String,
  invoiceDate: { type: Date, default: Date.now },
  lineItems: [{
    desc: String,
    qty: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  }],
  status: {
    type: String,
    enum: ['Draft','Submitted','Under Review','Approved','Paid','Rejected'],
    default: 'Draft',
  },
  paidAt: Date,
  dueDate: Date,
}, { timestamps: true });

invoiceSchema.pre('save', async function (next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments();
    this.invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
  }
  this.total = this.amount + this.tax;
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
