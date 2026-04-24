const mongoose = require('mongoose');

const classScheduleSchema = new mongoose.Schema({
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  branch: { type: String, required: true },       // e.g. aiml, ds, iot
  year: { type: Number, required: true },          // 1-4
  date: { type: Date, required: true },
  classPeriod: { type: Number, enum: [1,2,3,4,5,6], required: true },
  subject: { type: String },                       // pulled from faculty.subject or overridden
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // exam cell owner
}, { timestamps: true });

module.exports = mongoose.model('ClassSchedule', classScheduleSchema);
