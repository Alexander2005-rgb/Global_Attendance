const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/attendance', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');

    const users = [
      // { name: 'Jane Smith', email: 'faculty@example.com', password: 'password123', role: 'faculty' },
      { name: 'shivendra', email: 'shivendra@gmail.com', password: 'shiv@2005', role: 'exam cell' },
      { name: 'Ayushman', email: 'ayushman@gmail.com', password: 'ayushman@2005', role: 'exam cell' }
      // Sample Students for different years and classes

    ];

    for (const userData of users) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(userData.password, salt);
        const user = new User({ ...userData, password: hashedPassword });
        await user.save();
        console.log(`User ${userData.name} created`);
      } else {
        console.log(`User ${userData.name} already exists`);
      }
    }

    console.log('All users created successfully');
  } catch (err) {
    console.error(err);
  } finally {
    mongoose.connection.close();
  }
}

createUsers();
