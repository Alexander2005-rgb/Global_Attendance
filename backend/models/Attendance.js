const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true }, // Added time field to store when attendance was marked
  status: { type: String, enum: ['present', 'absent'], required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Faculty who marked it
  classPeriod: { type: Number, enum: [1, 2, 3, 4, 5, 6], required: true } // Added classPeriod for class-wise attendance
});

module.exports = mongoose.model('Attendance', attendanceSchema);
