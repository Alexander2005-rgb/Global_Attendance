const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function updateStudents() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/attendance', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    // Update all students: set year to 1 if null or undefined, and if class is null or empty, set to 'iot'
    const result = await User.updateMany(
      { role: 'student' },
      [
        {
          $set: {
            year: {
              $cond: {
                if: { $or: [{ $eq: ['$year', null] }, { $eq: ['$year', undefined] }] },
                then: 1,
                else: '$year'
              }
            },
            class: {
              $cond: {
                if: { $or: [{ $eq: ['$class', null] }, { $eq: ['$class', ''] }] },
                then: 'iot',
                else: '$class'
              }
            }
          }
        }
      ]
    );

    console.log(`Updated ${result.modifiedCount} students`);
    console.log('All students updated successfully');
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

updateStudents();
