const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let rooms = {};
let users = {}; // New object to map socketId to username

function generateCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function wordleFeedback(guess, correct) {
    let result = Array(5).fill("absent");
    let used = {};

    for (let i = 0; i < 5; i++) {
        if (guess[i] === correct[i]) {
            result[i] = "correct";
            used[i] = true;
        }
    }
    for (let i = 0; i < 5; i++) {
        if (result[i] === "correct") continue;
        for (let j = 0; j < 5; j++) {
            if (!used[j] && guess[i] === correct[j]) {
                result[i] = "present";
                used[j] = true;
                break;
            }
        }
    }
    return result;
}

io.on("connection", (socket) => {
    let socketId = socket.id;

    socket.on("createRoom", ({ secretWord, username }) => {
        const code = generateCode();
        
        users[socketId] = username;

        rooms[code] = { 
            word: secretWord, 
            players: [socketId],
            usernames: { [socketId]: username }, // Track username
            scores: { [socketId]: 0 }, 
            setterId: socketId, // Creator is the first setter
            guesserId: null, // Guesser is the next player to join
            guessCount: 0
        }; 
        socket.join(code);
        socket.emit("roomCreated", code, socketId, rooms[code].usernames);
    });

    socket.on("joinRoom", ({ code, username }) => {
        if (rooms[code]) {
            let roomData = rooms[code];
            
            if (roomData.players.length >= 2) {
                return socket.emit("roomFull"); 
            }
            
            users[socketId] = username;
            
            roomData.players.push(socketId);
            roomData.usernames[socketId] = username; // Track username
            roomData.scores[socketId] = 0;
            roomData.guesserId = socketId; // Joiner is the first guesser
            
            socket.join(code);
            socket.emit("joinedRoom", code, socketId, roomData.usernames);
            
            // Notify both players the game is starting
            io.to(code).emit("gameStart", { 
                setter: roomData.setterId, 
                guesser: roomData.guesserId,
                usernames: roomData.usernames 
            });

        } else {
            socket.emit("roomNotFound");
        }
    });

    socket.on("guess", ({ room, guess }) => {
        const roomData = rooms[room];
        
        if (!roomData) return;
        
        // Basic check to ensure the guesser is the one sending the guess
        if (socketId !== roomData.guesserId) return; 

        const correct = roomData.word;
        const feedback = wordleFeedback(guess, correct);

        // This will be replaced by Phase 2 logic to track guesses, scores, and turn end
        io.to(room).emit("result", { guess, feedback });
    });
    
    socket.on('disconnect', () => {
        delete users[socketId]; 
        for (const code in rooms) {
            const index = rooms[code].players.indexOf(socketId);
            if (index > -1) {
                rooms[code].players.splice(index, 1);
                delete rooms[code].usernames[socketId];
                delete rooms[code].scores[socketId];
                
                if (rooms[code].players.length === 0) {
                    delete rooms[code];
                } else {
                    io.to(code).emit("opponentLeft");
                }
            }
        }
    });

});

// 🌟 FIX: Use the dynamic port for cloud hosting, or 3000 locally
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Running on ${PORT}`));