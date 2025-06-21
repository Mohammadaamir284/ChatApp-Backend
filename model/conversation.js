const mongoose = require('mongoose')

const ConversationScheme = mongoose.Schema({
    members: { type: Array, required: true },
    unreadBy: [String],
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    deletedBy: {
        type: [String], // store userIds who deleted the conversation
        default: []
    }

})

module.exports = mongoose.model('Conversation', ConversationScheme)