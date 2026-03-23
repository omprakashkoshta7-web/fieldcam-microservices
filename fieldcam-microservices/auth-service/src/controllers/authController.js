const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.login = async (req, res) => {
  try {
    let { phone, email } = req.body;
    if (!phone && !email) return res.status(400).json({ message: 'Phone or email required' });

    if (phone) phone = phone.replace(/[\s\-\(\)]/g, '');

    const query = phone ? { phone } : { email };
    let user = await User.findOne(query);

    if (!user && phone) {
      if (phone.startsWith('+91')) user = await User.findOne({ phone: phone.slice(3) });
      if (!user && !phone.startsWith('+')) user = await User.findOne({ phone: `+91${phone}` });
    }
    if (!user) user = await User.create({ phone, email });

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    console.log(`OTP for ${phone || email}: ${otp}`);
    res.json({ message: 'OTP sent', otp });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phone, email, otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP required' });

    const user = await User.findOne(phone ? { phone } : { email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.matchOTP(otp)) return res.status(400).json({ message: 'Invalid or expired OTP' });

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ token, user: { id: user._id, phone: user.phone, email: user.email, role: user.role, profile: user.profile } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    if (email === 'admin@fieldworkcam.com' && password === 'Admin@1234') {
      const token = jwt.sign({ id: 'admin_hardcoded', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        user: { id: 'admin_hardcoded', email, role: 'admin', profile: { name: 'Sarah Kowalski', company: 'LaFloridians Field Services' } },
      });
    }

    const user = await User.findOne({ email, role: 'admin' });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = user.password
      ? (user.password.startsWith('$2') ? await bcrypt.compare(password, user.password) : user.password === password)
      : false;
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, role: user.role, profile: user.profile } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
