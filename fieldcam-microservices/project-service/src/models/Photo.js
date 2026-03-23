const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String, required: true },
  url: { type: String, required: true },
  thumbnailUrl: String,
  metadata: {
    gps: { latitude: Number, longitude: Number, accuracy: Number },
    timestamp: { type: Date, default: Date.now },
    deviceInfo: String,
  },
  aiValidation: {
    blurScore: { type: Number, default: 0 },
    brightnessScore: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 0 },
    isDuplicate: { type: Boolean, default: false },
    gpsValid: { type: Boolean, default: true },
    passed: { type: Boolean, default: true },
    warnings: [String],
  },
  status: { type: String, enum: ['pending','uploaded','validated','rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Photo', photoSchema);
