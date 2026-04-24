const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');

const router = express.Router();

// Configure multer for photo uploads (store in memory; we persist to MongoDB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Register
// Exam cell can create students and faculty
router.post('/register', auth, (req, res) => {
  upload.any()(req, res, async (err) => {
    if (err) {
      // Common: MulterError: File too large
      return res.status(400).json({ msg: err.message || 'Upload error' });
    }

  const { name, email, password, role, class: studentClass, year, rollNumber, subject } = req.body;
  try {
    const isExamCell = req.user.role === 'exam cell' || req.user.role === 'examcell' || req.user.role === 'exam_cell';
    if (!isExamCell) return res.status(403).json({ msg: 'Access denied' });
    if (!role || !['student', 'faculty'].includes(role)) {
      return res.status(400).json({ msg: 'Invalid role (allowed: student, faculty)' });
    }

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    if (role === 'student' && !rollNumber) {
      return res.status(400).json({ msg: 'rollNumber is required for students' });
    }
    if (role === 'student') {
      const existingRoll = await User.findOne({ rollNumber, role: 'student' });
      if (existingRoll) return res.status(400).json({ msg: 'Roll number already exists' });
    }

    user = new User({
      name,
      email,
      password,
      role,
      class: studentClass,
      year,
      rollNumber,
      subject: role === 'faculty' ? subject : undefined, // Only for faculty
      createdBy: req.user.id, // Link student/faculty to the exam cell who created them
    });

    if (req.files && req.files.length > 0) {
      user.photosData = req.files.map(file => ({
        data: file.buffer,
        contentType: file.mimetype
      }));
      // Set the first photo as avatar
      user.photoData = req.files[0].buffer;
      user.photoContentType = req.files[0].mimetype;
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    res.json({ msg: 'User registered successfully' });
  } catch (err) {
    res.status(500).send('Server error');
  }
  });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn: 3600 }, (err, token) => {
      if (err) throw err;
      res.json({ token, role: user.role });
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Update user (exam cell only)
router.put('/users/:id', auth, upload.any(), async (req, res) => {
  const { name, email, password, class: studentClass, year, rollNumber } = req.body;
  try {
    const isExamCell = req.user.role === 'exam cell' || req.user.role === 'examcell' || req.user.role === 'exam_cell';
    if (!isExamCell) return res.status(403).json({ msg: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Update fields
    if (name) user.name = name;
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail && String(existingEmail._id) !== String(user._id)) {
        return res.status(400).json({ msg: 'Email already exists' });
      }
      user.email = email;
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }
    if (studentClass) user.class = studentClass;
    if (year) user.year = year;
    if (rollNumber && rollNumber !== user.rollNumber) {
      if (user.role === 'student') {
        const existingRoll = await User.findOne({ rollNumber, role: 'student' });
        if (existingRoll && String(existingRoll._id) !== String(user._id)) {
          return res.status(400).json({ msg: 'Roll number already exists' });
        }
      }
      user.rollNumber = rollNumber;
    }
    if (req.files && req.files.length > 0) {
      user.photosData = req.files.map(file => ({
        data: file.buffer,
        contentType: file.mimetype
      }));
      user.photoData = req.files[0].buffer;
      user.photoContentType = req.files[0].mimetype;
      user.photo = undefined; // clear legacy path if present
    }

    await user.save();
    res.json({ msg: 'User updated successfully' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Delete user (exam cell only)
router.delete('/users/:id', auth, async (req, res) => {
  try {
    const isExamCell = req.user.role === 'exam cell' || req.user.role === 'examcell' || req.user.role === 'exam_cell';
    if (!isExamCell) return res.status(403).json({ msg: 'Access denied' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    await user.deleteOne();
    res.json({ msg: 'User deleted successfully' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
