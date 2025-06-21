const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: String,
        ref: 'Conversation'
    },
    senderId: {
        type: String,
        required: true
    },
    messages: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
