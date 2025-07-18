const express = require('express');
const bcryptjs = require('bcryptjs')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const http = require('http');

const app = express();
app.use(cors({
    origin: process.env.FRONT_PORT || 'http://localhost:5173',
    credentials: true
}));
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: process.env.FRONT_PORT || 'http://localhost:5173',
        credentials: true
    }
})
//Connect DB
require('./db/connectbd')
// Import file 
const User = require('./model/user')
const Conversation = require('./model/conversation')
const Message = require('./model/message');
const Notification = require('./model/notification')

//use Express

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

//LocalHost Port
const port = process.env.PORT || 8000;
//Socket.io
let Users = []
io.on('connection', socket => {
    socket.on('addUser', UserId => {
        const isUserExist = Users.find(user => user.UserId === UserId)
        if (!isUserExist) {
            const user = { UserId, socketId: socket.id }
            Users.push(user)
            io.emit('getUser', Users)
        }
    })

    socket.on('sendMessage', async ({ conversationId, senderId, messages, receiverId }) => {
        const receiver = Users.find(user => user.UserId === receiverId)
        const sender = Users.find(user => user.UserId === senderId)
        const socketUser = await User.findById(senderId)

        const data = {
            conversationId,
            senderId,
            messages,
            receiverId,
            socketUser: {
                id: socketUser._id,
                fullname: socketUser.fullname,
                email: socketUser.email
            }
        };

        if (!receiver) {
            await Notification.create({
                senderId: senderId,
                receiverId: receiverId,
                message: messages,
                conversationId: conversationId,
                isRead: false
            });
        } else {
            io.to(receiver.socketId).emit('getMessage', data);
        }


        if (sender) {
            io.to(sender.socketId).emit('getMessage', data);
        }

        if (!receiver && !sender) {
            console.log('❌ Neither sender nor receiver found in connected Users');
        }
    })
    // io.emit('getUser', socket.UserId)
    socket.on('disconnect', () => {
        Users = Users.filter(user => user.socketId !== socket.id)
        io.emit('getUser', Users)
    })
})
//app Use
app.post('/api/register', async (req, res, next) => {
    try {
        const { fullname, email, password, pic } = req.body;
        if (!fullname || !email || !password) {
            return res.status(400).json({ message: 'Please Fill All Required Fields' })
        } else {
            const isAlreadyExist = await User.findOne({ email })
            if (isAlreadyExist) {
                return res.status(400).json({ message: 'User Already Exists' })
            }
            const newUser = new User({ fullname, email, pic })
            bcryptjs.hash(password, 10, async (err, hashedPassword) => {
                newUser.set('password', hashedPassword);
                await newUser.save();

                res.status(200).json({ message: 'User Registered Successfully', newUser })
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.post('/api/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Please Fill All Required Fields' })
        } else {
            const user = await User.findOne({ email })
            if (!user) {
                return res.status(400).json({ message: 'Email adderss is incorrect' })
            } else {
                const checkpassword = await bcryptjs.compare(password, user.password)
                if (!checkpassword) {
                    return res.status(400).json({ message: 'Password is incorrect' })
                } else {
                    const playload = { userId: user._id, mail: user.email }
                    const secret = process.env.JWT_SECRET_KEY || 'hqwhefi2g3rh2bd32t723fb238743'
                    jwt.sign(playload, secret, { expiresIn: 86400 }, async (err, token) => {
                        if (err) {
                            return res.status(500).json({ message: 'Token generation failed', error: err });
                        }
                        await user.updateOne({ _id: user._id }, { $set: { token } });
                        res.status(200).json({
                            message: `Welcome Back ${user.fullname}`,
                            user: {
                                email: user.email,
                                fullname: user.fullname,
                                pic: user.pic,
                                userId: user._id
                            },
                            token: token
                        });
                    });
                }
            }
        }
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

app.put('/api/update-pic/:userId', async (req, res) => {
    try {
        const { userId, pic } = req.body;
        if (!userId || !pic) {
            return res.status(400).json({ message: 'User ID and new picture are required' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        user.pic = pic;
        await user.save();
        res.status(200).json({
            message: 'Profile picture updated successfully',
            pic: user.pic
        });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
});

app.post('/api/conversation', async (req, res) => {
    try {
        const { senderId, receiverId } = req.body;
        if (!senderId || !receiverId) {
            return res.status(400).json({ message: "Both senderId and receiverId are required." });
        }
        let conversation = await Conversation.findOne({
            members: { $all: [senderId, receiverId], $size: 2 }
        });
        if (!conversation) {
            conversation = new Conversation({ members: [senderId, receiverId] });
            await conversation.save();
        }
        res.status(200).json({ message: "Conversation ready", conversationId: conversation._id });
    } catch (error) {
        res.status(500).json({ message: 'Conversation POST Error', error: error.message });
    }
});


app.get('/api/conversation/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const conversation = await Conversation.find({ members: { $in: [userId] }, deletedBy: { $ne: userId }, }).sort({ lastMessageAt: -1 });
        const conversationUserData = await Promise.all(
            conversation.map(async (conversation) => {
                const receiverId = conversation.members.find(member => member !== userId);
                const user2 = await User.findById(receiverId);
                if (!user2) {
                    return null; // Skip this entry
                }
                return { user2: { receiverId: user2._id, email: user2.email, fullname: user2.fullname, pic: user2.pic }, conversationId: conversation._id, isUnread: conversation.unreadBy.includes(userId) }
            })
        );
        const cleanConversationData = conversationUserData.filter(Boolean);
        res.status(200).json({ message: `Welcome sir`, cleanConversationData })
    } catch (error) {
        res.status(500).json({ message: 'Conversation Get Error', error: error.message });
    }
})

app.post('/api/message', async (req, res) => {
    try {
        const { conversationId, senderId, messages, receiverId = '' } = req.body;
        if (!messages) {
            return res.status(400).json({ message: "Message cannot be empty" });
        }
        let convId;
        // 🔹 NEW conversation
        if ((!conversationId || conversationId === 'new') && receiverId) {
            let existingConversation = await Conversation.findOne({
                members: { $all: [senderId, receiverId], $size: 2 }
            });
            if (existingConversation) {
                convId = existingConversation._id;
                // 🔄 Remove senderId from deletedBy if exists (restore visibility)
                if (existingConversation.deletedBy?.includes(senderId)) {
                    await Conversation.findByIdAndUpdate(convId, {
                        $pull: { deletedBy: senderId }
                    });
                }
                await Conversation.findByIdAndUpdate(convId, {
                    $addToSet: { unreadBy: receiverId },
                    $set: { lastMessageAt: new Date() }
                });
            } else {
                const newConversation = new Conversation({
                    members: [senderId, receiverId],
                    lastMessageAt: new Date()
                });
                await newConversation.save();
                convId = newConversation._id;
            }
            const newChatmessage = new Message({
                conversationId: convId,
                senderId,
                messages
            });
            await newChatmessage.save();
            return res.status(200).json({
                message: `Message sent successfully`,
                conversationId: convId
            });
        }
        // 🔹 EXISTING conversation
        const chatmessage = new Message({ conversationId, senderId, messages });
        await chatmessage.save();
        await Conversation.findByIdAndUpdate(conversationId, {
            $set: { lastMessageAt: new Date() }
        });
        return res.status(200).json({ message: `Message sent`, conversationId });
    } catch (error) {
        console.error("Message Post Error:", error.message);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});
app.get('/api/message/:conversationId', async (req, res) => {
    try {
        const getCleanMessages = async (conversationId) => {
            const messagedata = await Message.find({ conversationId })
         
            const senderIds = [...new Set(messagedata.map(m => m.senderId.toString()))];

            // Bulk fetch users
            const users = await User.find({ _id: { $in: senderIds } });

            // Map userId -> userData
            const userMap = {};
            users.forEach(user => {
                userMap[user._id.toString()] = {
                    id: user._id,
                    email: user.email,
                    fullname: user.fullname
                };
            });

            // Clean message format
            const messageusersdata = messagedata.map(message => {
                const user = userMap[message.senderId.toString()];
                if (!user) return null;
                return {
                    user,
                    messages: message.messages
                };
            });

            return messageusersdata.filter(Boolean);
        };

        const conversationId = req.params.conversationId;

        if (conversationId === 'new') {
            const { senderId, receiverId } = req.query;
            const checkConversation = await Conversation.find({
                members: { $all: [senderId, receiverId] }
            });

            if (checkConversation.length > 0) {
                const messages = await getCleanMessages(checkConversation[0]._id);
                return res.status(200).json({ message: "Messages Data", cleanConversationData: messages });
            } else {
                return res.status(200).json([]);
            }
        } else {
            const messages = await getCleanMessages(conversationId);
            return res.status(200).json({ message: "Messages Data", cleanConversationData: messages });
        }
    } catch (error) {
        res.status(500).json({ message: 'Message Get Error', error: error.message });
    }
});

//only user 
app.get('/api/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.find({ _id: { $ne: userId } })
        const userdata = await Promise.all(
            user.map(async (user) => {
                return { user: { email: user.email, fullname: user.fullname, receiverId: user._id, pic: user.pic } }
            })
        )
        res.status(200).json({ message: `All User`, userdata })
    } catch (error) {
        res.status(500).json({ message: 'User Post Error ', error: error.message });
    }
})

app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const notifications = await Notification.find({ receiverId: userId, isRead: false })
            .sort({ createdAt: -1 })
            .populate('senderId', 'fullname email');
        res.status(200).json({ message: "Unread Notifications", notifications });
    } catch (error) {
        res.status(500).json({ message: "Error fetching notifications", error: error.message });
    }
});

app.put('/api/notifications/read/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        await Notification.updateMany({ receiverId: userId, isRead: false }, { $set: { isRead: true } });
        res.status(200).json({ message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ message: "Error updating notifications", error: error.message });
    }
});

app.delete('/api/conversation/:conversationId/:userId', async (req, res) => {
    const { conversationId, userId } = req.params;
    try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }
        // If already deleted by this user
        if (conversation.deletedBy.includes(userId)) {
            return res.status(400).json({ message: "Already deleted by this user" });
        }
        // Add user to deletedBy array
        conversation.deletedBy.push(userId);
        await conversation.save();
        // 🔥 Check if both users have deleted
        if (conversation.deletedBy.length === 2) {
            await Message.deleteMany({ conversationId }); // delete all messages
            await Conversation.findByIdAndDelete(conversationId); // delete conversation
            return res.status(200).json({ message: "Conversation deleted for both users and removed permanently." });
        }
        res.status(200).json({ message: "Conversation hidden for this user." });
    } catch (error) {
        res.status(500).json({ message: "Error deleting conversation", error: error.message });
    }
});

server.listen(port, () => {
    console.log("Listen on Port " + port);
})