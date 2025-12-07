const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let rooms = {};
let users = {};

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
            word: secretWord.toUpperCase(), // Store word in uppercase
            players: [socketId],
            usernames: { [socketId]: username },
            scores: { [socketId]: 0 }, 
            setterId: socketId, 
            guesserId: null, 
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
            roomData.usernames[socketId] = username;
            roomData.scores[socketId] = 0;
            roomData.guesserId = socketId; // Joiner is the first guesser
            
            socket.join(code);
            socket.emit("joinedRoom", code, socketId, roomData.usernames);
            
            io.to(code).emit("gameStart", { 
                setter: roomData.setterId, 
                guesser: roomData.guesserId,
                usernames: roomData.usernames 
            });

        } else {
            socket.emit("roomNotFound");
        }
    });

    // New handler for the next round's word setting
    socket.on("setNextWord", ({ room, secretWord }) => {
        const roomData = rooms[room];
        if (roomData && socketId === roomData.setterId) {
            if (roomData.word !== null) {
                return socket.emit("errorMsg", "A word is already set for this round!");
            }
            
            roomData.word = secretWord.toUpperCase();
            roomData.guessCount = 0;
            // Notify clients that the word is set, guesser can start
            io.to(room).emit("wordSet", { setterId: roomData.setterId, newGuesserId: roomData.guesserId });
        }
    });


    socket.on("guess", ({ room, guess }) => {
        const roomData = rooms[room];
        
        if (!roomData || socketId !== roomData.guesserId) return;
        
        const correct = roomData.word;
        
        // CRITICAL FIX: Check if the word is set (not null)
        if (!correct) {
            socket.emit("errorMsg", "The secret word has not been set for this round yet.");
            return;
        }
        
        const feedback = wordleFeedback(guess.toUpperCase(), correct);
        
        const isCorrect = guess.toUpperCase() === correct;
        roomData.guessCount++;
        
        io.to(room).emit("result", { guess: guess.toUpperCase(), feedback, isCorrect });

        if (isCorrect || roomData.guessCount >= 6) {
            
            // GAME OVER LOGIC
            let winnerId = null;
            if (isCorrect) {
                // Scoring: 6 points for guess 1, 1 point for guess 6
                roomData.scores[socketId] += (7 - roomData.guessCount);
                winnerId = socketId;
            }

            // Determine next turn: roles flip
            const newSetterId = roomData.guesserId; 
            const newGuesserId = roomData.setterId; 

            // Reset room state for the next turn
            roomData.setterId = newSetterId;
            roomData.guesserId = newGuesserId;
            roomData.word = null; // Forces the new setter to input a word

            io.to(room).emit("gameOver", { 
                winnerId: winnerId, 
                newSetterId: newSetterId,
                scores: roomData.scores,
                lostOnGuessCount: roomData.guessCount >= 6 && !isCorrect
            });
        }
    });
    
    socket.on('disconnect', () => {
        delete users[socketId]; 
        // Disconnect logic for rooms...
    });

});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Running on ${PORT}`));