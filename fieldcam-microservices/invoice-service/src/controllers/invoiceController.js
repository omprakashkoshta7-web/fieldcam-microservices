const Invoice = require('../models/Invoice');

exports.getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ vendor: req.user._id }).populate('project', 'projectNumber address title client').sort({ createdAt: -1 });
    res.json(invoices);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, vendor: req.user._id }).populate('project', 'projectNumber address title client');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createInvoice = async (req, res) => {
  try {
    const { project, amount, tax, description, dueDate, billTo, vendorName, vendorEmail, lineItems, invoiceDate } = req.body;
    const invoice = await Invoice.create({ vendor: req.user._id, project: project || undefined, amount, tax: tax || 0, description, dueDate, billTo, vendorName, vendorEmail, lineItems: lineItems || [], invoiceDate: invoiceDate || new Date(), status: 'Draft' });
    res.status(201).json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateInvoice = async (req, res) => {
  try {
    const { amount, tax, description, dueDate, billTo, vendorName, vendorEmail, lineItems, invoiceDate } = req.body;
    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.params.id, vendor: req.user._id, status: 'Draft' },
      { amount, tax, description, dueDate, billTo, vendorName, vendorEmail, lineItems, invoiceDate }, { new: true }
    );
    if (!invoice) return res.status(404).json({ message: 'Invoice not found or already submitted' });
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.submitInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOneAndUpdate({ _id: req.params.id, vendor: req.user._id, status: 'Draft' }, { status: 'Submitted' }, { new: true });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Admin
exports.getAdminInvoices = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status && status !== 'All') query.status = status;
    const skip = (page - 1) * limit;
    const [invoices, total] = await Promise.all([
      Invoice.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('vendor', 'profile.name email phone').populate('project', 'projectNumber title'),
      Invoice.countDocuments(query),
    ]);
    res.json({ invoices, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateInvoiceStatus = async (req, res) => {
  try {
    const update = { status: req.body.status };
    if (req.body.status === 'Paid') update.paidAt = new Date();
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, update, { new: true }).populate('vendor', 'profile.name email').populate('project', 'projectNumber title');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createAdminInvoice = async (req, res) => {
  try { res.status(201).json(await Invoice.create(req.body)); }
  catch (err) { res.status(400).json({ message: err.message }); }
};

exports.deleteInvoice = async (req, res) => {
  try { await Invoice.findByIdAndDelete(req.params.id); res.json({ message: 'Invoice deleted' }); }
  catch (err) { res.status(500).json({ message: err.message }); }
};
