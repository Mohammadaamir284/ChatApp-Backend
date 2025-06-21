const mongoose = require('mongoose');
require('dotenv').config();  // ✅ Load environment variables

const url = process.env.MONGODB_URL;
console.log("MongoDB URL");


mongoose.connect(url)
.then(() => console.log('Connected to DB'))
.catch((e) => console.log('Error Catch', e));
