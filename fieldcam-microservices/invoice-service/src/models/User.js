const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true, lowercase: true },
  role: { type: String, enum: ['admin', 'vendor', 'staff'], default: 'vendor' },
  isVerified: { type: Boolean, default: false },
  profile: { name: String, company: String, address: String, documents: [String], avatar: String },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
