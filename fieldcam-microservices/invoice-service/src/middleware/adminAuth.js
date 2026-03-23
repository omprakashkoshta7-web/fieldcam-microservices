const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.id === 'admin_hardcoded' && decoded.role === 'admin') {
      req.user = { _id: 'admin_hardcoded', role: 'admin', profile: { name: 'Sarah Kowalski' } };
      return next();
    }
    const user = await User.findById(decoded.id).select('-otp -otpExpiry');
    if (!user || user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};
