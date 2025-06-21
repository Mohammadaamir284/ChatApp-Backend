const mongoose = require('mongoose')

const UserSchema = mongoose.Schema({
    fullname: {type: String, required: true},
    email: {type: String, required: true},
    password: {type: String, required: true},
    token: {type: String}
})

module.exports = mongoose.model('User', UserSchema)