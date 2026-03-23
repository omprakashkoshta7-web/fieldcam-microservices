const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true, lowercase: true },
  role: { type: String, enum: ['admin', 'vendor', 'staff'], default: 'vendor' },
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  profile: { name: String, company: String, address: String, documents: [String], avatar: String },
  password: { type: String },
  isActive: { type: Boolean, default: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

userSchema.methods.matchOTP = function (otp) {
  return this.otp === otp && this.otpExpiry > Date.now();
};

module.exports = mongoose.model('User', userSchema);
