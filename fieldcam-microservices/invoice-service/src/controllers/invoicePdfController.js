const PDFDocument = require('pdfkit');
const Invoice = require('../models/Invoice');

exports.downloadPdf = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, vendor: req.user._id }).populate('project', 'projectNumber address title client');
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber || 'invoice'}.pdf"`);
    doc.pipe(res);

    const primary = '#7A5C47', gray = '#6B7280', light = '#9CA3AF';

    doc.fontSize(28).fillColor(primary).font('Helvetica-Bold').text('INVOICE', 50, 50);
    doc.fontSize(10).fillColor(light).font('Helvetica').text(invoice.invoiceNumber || 'INV-DRAFT', 50, 85);

    const vendorName = invoice.vendorName || 'Vendor';
    const vendorEmail = invoice.vendorEmail || '';
    doc.fontSize(11).fillColor('#1A1A1A').font('Helvetica-Bold').text(vendorName, 350, 50, { align: 'right', width: 200 });
    doc.fontSize(9).fillColor(gray).font('Helvetica').text('Licensed Contractor', 350, 66, { align: 'right', width: 200 }).text(vendorEmail, 350, 78, { align: 'right', width: 200 });

    doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#E5E7EB').lineWidth(1).stroke();

    const billTo = invoice.billTo || invoice.project?.client || 'Client';
    const billAddr = invoice.project?.address || '';
    const invDate = invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Net 14';

    doc.fontSize(8).fillColor(light).font('Helvetica-Bold').text('BILL TO', 50, 120);
    doc.fontSize(11).fillColor('#1A1A1A').font('Helvetica-Bold').text(billTo, 50, 133);
    if (billAddr) doc.fontSize(9).fillColor(gray).font('Helvetica').text(billAddr, 50, 148);
    doc.fontSize(8).fillColor(light).font('Helvetica-Bold').text('INVOICE DATE', 380, 120);
    doc.fontSize(11).fillColor('#1A1A1A').font('Helvetica-Bold').text(invDate, 380, 133);
    doc.fontSize(8).fillColor(light).font('Helvetica-Bold').text('DUE DATE', 380, 155);
    doc.fontSize(11).fillColor('#1A1A1A').font('Helvetica-Bold').text(dueDate, 380, 168);

    let y = billAddr ? 185 : 175;
    if (invoice.project) {
      const ref = `${invoice.project.projectNumber || ''} — ${invoice.project.address || invoice.project.title || ''}`;
      doc.rect(50, y, 495, 28).fillColor('#F9F5F2').fill();
      doc.fontSize(8).fillColor(light).font('Helvetica-Bold').text('PROJECT REFERENCE', 62, y + 5);
      doc.fontSize(9).fillColor(primary).font('Helvetica-Bold').text(ref, 62, y + 15);
      y += 40;
    }

    y += 10;
    doc.rect(50, y, 495, 22).fillColor('#F3F4F6').fill();
    doc.fontSize(8).fillColor(light).font('Helvetica-Bold');
    doc.text('DESCRIPTION', 60, y + 7).text('QTY', 330, y + 7).text('RATE', 380, y + 7).text('AMOUNT', 460, y + 7, { align: 'right', width: 75 });
    y += 22;

    const items = invoice.lineItems?.length ? invoice.lineItems : [{ desc: invoice.description || 'Service', qty: 1, rate: invoice.amount, amount: invoice.amount }];
    items.forEach((item, i) => {
      doc.rect(50, y, 495, 24).fillColor(i % 2 === 0 ? '#FFFFFF' : '#FAFAFA').fill();
      doc.fontSize(10).fillColor('#1A1A1A').font('Helvetica').text(item.desc || '', 60, y + 7, { width: 260 });
      doc.text(String(item.qty ?? 1), 330, y + 7, { width: 40 }).text(`${item.rate ?? 0}.00`, 380, y + 7, { width: 70 });
      doc.font('Helvetica-Bold').text(`${item.amount ?? 0}.00`, 460, y + 7, { align: 'right', width: 75 });
      y += 24;
    });

    y += 10;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 12;

    const subtotal = invoice.amount || 0, tax = invoice.tax || 0, total = invoice.total || subtotal + tax;
    doc.fontSize(10).fillColor(gray).font('Helvetica');
    doc.text('Subtotal', 380, y).text(`${subtotal}.00`, 460, y, { align: 'right', width: 75 }); y += 18;
    doc.text('Tax (8%)', 380, y).text(`${tax}.00`, 460, y, { align: 'right', width: 75 }); y += 18;
    doc.moveTo(380, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke(); y += 8;
    doc.fontSize(13).fillColor('#1A1A1A').font('Helvetica-Bold').text('Total Due', 380, y).text(`${total}.00`, 460, y, { align: 'right', width: 75 }); y += 30;

    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke(); y += 14;
    doc.fontSize(8).fillColor(light).font('Helvetica-Bold').text('VENDOR SIGNATURE', 50, y); y += 12;
    doc.fontSize(18).fillColor('#1A1A1A').font('Helvetica-Oblique').text(vendorName, 50, y);
    doc.fontSize(9).fillColor('#16A34A').font('Helvetica-Bold').text('✓ Digitally Signed', 350, y + 6); y += 36;

    doc.fontSize(8).fillColor(light).font('Helvetica').text('Generated by FieldWork Cam', 50, 780, { align: 'center', width: 495 });
    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
};
