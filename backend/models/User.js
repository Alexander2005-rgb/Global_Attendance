const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'faculty', 'exam cell'], required: true },
  class: { type: String, required: false },
  year: { type: Number, required: false },
  rollNumber: { type: String, required: false },
  photo: { type: String, required: false },
  photoData: { type: Buffer, required: false },
  photoContentType: { type: String, required: false },
  photosData: [{
    data: Buffer,
    contentType: String
  }],
  subject: { type: String, required: false }, // Subject taught by faculty
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false } // Exam cell who created this user
});

module.exports = mongoose.model('User', userSchema);
