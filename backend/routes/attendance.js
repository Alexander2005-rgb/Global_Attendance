const express = require('express');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const ClassSchedule = require('../models/ClassSchedule');
const auth = require('../middleware/auth');

const router = express.Router();


// Get attendance (students see their own, faculty and exam cell see all)
// Supports optional query params: date (ISO string), startDate, endDate, classPeriod (1-6), year, class
router.get('/', auth, async (req, res) => {
  try {
    const { date, startDate, endDate, classPeriod, year, class: studentClass, rollNumber } = req.query;
    const query = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    } else if (date) {
      // Parse date as local start of day
      const start = new Date(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    if (classPeriod) {
      query.classPeriod = Number(classPeriod);
    }

    const studentMatch = {};
    if (year) studentMatch.year = Number(year);
    if (studentClass) studentMatch.class = studentClass;
    if (req.query.rollNumber) studentMatch.rollNumber = req.query.rollNumber;

    if (req.user.role === 'faculty' || req.user.role === 'exam cell') {
      // Exam cell users only see students they created; faculty see students created by their exam cell
      if (req.user.role === 'exam cell') {
        studentMatch.createdBy = req.user.id;
      } else {
        // Faculty: find their exam cell owner and filter by that
        const facultyUser = await User.findById(req.user.id);
        if (facultyUser && facultyUser.createdBy) {
          studentMatch.createdBy = facultyUser.createdBy;
        }
      }

      let attendance = await Attendance.find(query)
        .populate({
          path: 'student',
          select: 'name email class year rollNumber createdBy',
          match: studentMatch
        })
        .populate('markedBy', 'rollNumber')
        .catch(err => {
          console.error('Population error:', err);
          return [];
        });

      // Filter out attendance where student is null due to match
      attendance = attendance.filter(att => att.student !== null);

      console.log('Sending attendance data to frontend:', JSON.stringify(attendance, null, 2)); // Debug log
      res.json(attendance);
    } else {
      query.student = req.user.id;
      const attendance = await Attendance.find(query)
        .populate('student', 'name email class year rollNumber')
        .populate('markedBy', 'rollNumber')
        .catch(err => {
          console.error('Population error:', err);
          return [];
        });

      console.log('Sending attendance data to frontend:', JSON.stringify(attendance, null, 2)); // Debug log
      res.json(attendance);
    }
  } catch (err) {
    console.error('Error in attendance route:', err);
    res.status(500).send('Server error');
  }
});

// Mark attendance (for face detection, but here manual for now)
router.post('/', auth, async (req, res) => {
  const { studentId, date, status, classPeriod } = req.body;
  try {
    if (req.user.role !== 'faculty') return res.status(403).json({ msg: 'Access denied' });

    // Normalize date to start of day local
    const dateObj = new Date(date);

    // Get current time
    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    let attendance = await Attendance.findOne({ student: studentId, date: dateObj, classPeriod });
    if (attendance) {
      attendance.status = status;
      attendance.time = currentTime; // Store current time when marking attendance
      attendance.markedBy = req.user.id;
      await attendance.save();
    } else {
      attendance = new Attendance({ student: studentId, date: dateObj, time: currentTime, status, markedBy: req.user.id, classPeriod });
      await attendance.save();
    }
    res.json(attendance);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Update attendance (faculty only)
router.put('/:id', auth, async (req, res) => {
  const { status } = req.body;
  try {
    if (req.user.role !== 'faculty') return res.status(403).json({ msg: 'Access denied' });

    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) return res.status(404).json({ msg: 'Attendance not found' });

    attendance.status = status;
    attendance.markedBy = req.user.id;
    await attendance.save();
    res.json(attendance);
  } catch (err) {
    res.status(500).send('Server error');
  }
});



// Mark attendance from face detection (no auth needed for simplicity, or add API key)
router.post('/mark', async (req, res) => {
  console.log('Received attendance mark request:', req.body);
  const { rollNumber, date, time, status, classPeriod } = req.body;
  try {
    const user = await User.findOne({ rollNumber });
    if (!user) {
      console.log('User not found:', rollNumber);
      return res.status(404).json({ msg: 'User not found' });
    }

    // Normalize date to start of day local
    const dateObj = new Date(date);

    let attendance = await Attendance.findOne({ student: user._id, date: dateObj, classPeriod });
    if (attendance) {
      attendance.status = status;
      attendance.time = time; // Update time when status changes
    } else {
      attendance = new Attendance({ student: user._id, date: dateObj, time, status, classPeriod });
    }
    await attendance.save();

    // After marking present, mark absent for students in the same class who don't have a record
    if (status === 'present') {
      const studentsInClass = await User.find({ role: 'student', class: user.class, year: user.year });
      for (const student of studentsInClass) {
        const existingAttendance = await Attendance.findOne({ student: student._id, date: dateObj, classPeriod });
        if (!existingAttendance) {
          const absentAttendance = new Attendance({
            student: student._id,
            date: dateObj,
            time: '00:00:00', // Default time for auto-absent
            status: 'absent',
            classPeriod,
            markedBy: null // Auto-marked
          });
          await absentAttendance.save();
          console.log(`Auto-marked absent for student: ${student.name}`);
        }
      }
    }

    res.json(attendance);
  } catch (err) {
    console.error('Error in /mark route:', err);
    res.status(500).send('Server error');
  }
});



// Get all students
router.get('/students', auth, async (req, res) => {
  try {
    const { year, class: studentClass } = req.query;
    const query = { role: 'student' };
    if (year) query.year = Number(year);
    if (studentClass) query.class = studentClass;

    // Scope students to the requesting exam cell or faculty's exam cell
    if (req.user.role === 'exam cell') {
      query.createdBy = req.user.id;
    } else if (req.user.role === 'faculty') {
      const facultyUser = await User.findById(req.user.id);
      if (facultyUser && facultyUser.createdBy) {
        query.createdBy = facultyUser.createdBy;
      }
    }

    const students = await User.find(query).select('name email class year rollNumber');
    res.json(students);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Get attendance for a specific student by roll number (for charting)
router.get('/student/:rollNumber', auth, async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const { startDate, endDate } = req.query;

    // Build student query scoped to the exam cell
    const studentQuery = { rollNumber, role: 'student' };
    if (req.user.role === 'exam cell') {
      studentQuery.createdBy = req.user.id;
    } else if (req.user.role === 'faculty') {
      const facultyUser = await User.findById(req.user.id);
      if (facultyUser && facultyUser.createdBy) {
        studentQuery.createdBy = facultyUser.createdBy;
      }
    }

    // Find the student by roll number (scoped)
    const student = await User.findOne(studentQuery);
    if (!student) {
      return res.status(404).json({ msg: 'Student not found' });
    }

    // Build query for attendance
    const query = { student: student._id };
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    const attendance = await Attendance.find(query).sort({ date: 1 });
    res.json(attendance);
  } catch (err) {
    console.error('Error fetching student attendance:', err);
    res.status(500).send('Server error');
  }
});

// ========================================
// CLASS SCHEDULE ROUTES
// ========================================

// Faculty assigns a class (POST /api/attendance/schedule)
router.post('/schedule', auth, async (req, res) => {
  try {
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ msg: 'Only faculty can assign a class' });
    }
    const { branch, year, date, classPeriod, subject } = req.body;
    if (!branch || !year || !date || !classPeriod) {
      return res.status(400).json({ msg: 'branch, year, date and classPeriod are required' });
    }

    // Resolve exam cell owner from faculty's createdBy
    const facultyUser = await User.findById(req.user.id);

    // Check for conflict: same branch/year/date/period already assigned to someone else
    const dateObj = new Date(date);
    const dayStart = new Date(dateObj); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dateObj); dayEnd.setHours(23, 59, 59, 999);

    const conflict = await ClassSchedule.findOne({
      branch, year: Number(year), classPeriod: Number(classPeriod),
      date: { $gte: dayStart, $lte: dayEnd },
      faculty: { $ne: req.user.id }
    });
    if (conflict) {
      return res.status(409).json({ msg: 'Another faculty already assigned this slot' });
    }

    // Upsert: allow a faculty to re-assign (update subject if same slot)
    let schedule = await ClassSchedule.findOne({
      faculty: req.user.id, branch, year: Number(year),
      classPeriod: Number(classPeriod), date: { $gte: dayStart, $lte: dayEnd }
    });

    if (schedule) {
      schedule.subject = subject || facultyUser.subject || '';
      await schedule.save();
    } else {
      schedule = await ClassSchedule.create({
        faculty: req.user.id,
        branch,
        year: Number(year),
        date: dateObj,
        classPeriod: Number(classPeriod),
        subject: subject || facultyUser.subject || '',
        createdBy: facultyUser.createdBy || null
      });
    }

    res.json({ msg: 'Class assigned successfully', schedule });
  } catch (err) {
    console.error('Error assigning class:', err);
    res.status(500).send('Server error');
  }
});

// Get schedules (GET /api/attendance/schedule)
// Faculty: sees their own   Student: sees schedules for their branch/year
router.get('/schedule', auth, async (req, res) => {
  try {
    const { date, startDate, endDate, branch, year } = req.query;
    const query = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    } else if (date) {
      const d = new Date(date);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      query.date = { $gte: start, $lte: end };
    }

    if (req.user.role === 'faculty') {
      query.faculty = req.user.id;
      if (branch) query.branch = branch;
      if (year) query.year = Number(year);
    } else if (req.user.role === 'student') {
      // Student sees schedules for their own branch and year
      const student = await User.findById(req.user.id);
      if (student) {
        query.branch = student.class;
        query.year = student.year;
      }
    } else {
      // exam cell: filter by branch/year if given
      if (branch) query.branch = branch;
      if (year) query.year = Number(year);
    }

    const schedules = await ClassSchedule.find(query)
      .populate('faculty', 'name subject email')
      .sort({ date: 1, classPeriod: 1 });

    res.json(schedules);
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).send('Server error');
  }
});

// Delete a schedule (faculty only, own schedules)
router.delete('/schedule/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ msg: 'Only faculty can remove class assignments' });
    }
    const schedule = await ClassSchedule.findOne({ _id: req.params.id, faculty: req.user.id });
    if (!schedule) return res.status(404).json({ msg: 'Schedule not found' });
    await schedule.deleteOne();
    res.json({ msg: 'Class removed' });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Get all faculty (for exam cell)
router.get('/faculty', auth, async (req, res) => {
  try {
    if (req.user.role !== 'exam cell') {
      return res.status(403).json({ msg: 'Access denied' });
    }
    const facultyList = await User.find({ role: 'faculty', createdBy: req.user.id })
      .select('name email subject');
    res.json(facultyList);
  } catch (err) {
    res.status(500).send('Server error');
  }
});

module.exports = router;
