const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function guessContentType(ext) {
  const e = ext.toLowerCase();
  if (e === '.png') return 'image/png';
  if (e === '.jpg' || e === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

async function main() {
  if (!MONGO_URI) {
    throw new Error('MONGO_URI is not set (check backend/.env)');
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    throw new Error(`Uploads directory not found: ${UPLOADS_DIR}`);
  }

  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const files = fs
    .readdirSync(UPLOADS_DIR)
    .filter((f) => /\.(jpg|jpeg|png)$/i.test(f));

  let updated = 0;
  let skipped = 0;

  for (const filename of files) {
    const ext = path.extname(filename);
    const rollNumber = path.basename(filename, ext);
    const filePath = path.join(UPLOADS_DIR, filename);

    const user = await User.findOne({ role: 'student', rollNumber });
    if (!user) {
      skipped += 1;
      continue;
    }

    const buf = fs.readFileSync(filePath);
    user.photoData = buf;
    user.photoContentType = guessContentType(ext);
    user.photo = undefined;
    await user.save();
    updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`Done. Updated ${updated} student photos. Skipped ${skipped} files (no matching student).`);

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

