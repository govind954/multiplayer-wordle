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
            word: secretWord.toUpperCase(),
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
            roomData.guesserId = socketId;
            
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

    socket.on("setNextWord", ({ room, secretWord }) => {
        const roomData = rooms[room];
        if (roomData && socketId === roomData.setterId) {
            if (roomData.word !== null) {
                return socket.emit("errorMsg", "A word is already set for this round!");
            }
            
            roomData.word = secretWord.toUpperCase();
            roomData.guessCount = 0;
            io.to(room).emit("wordSet", { setterId: roomData.setterId, newGuesserId: roomData.guesserId });
        }
    });


    socket.on("guess", ({ room, guess }) => {
        const roomData = rooms[room];
        
        if (!roomData || socketId !== roomData.guesserId) return;
        
        const correct = roomData.word;
        
        if (!correct) {
            socket.emit("errorMsg", "The secret word has not been set for this round yet.");
            return;
        }
        
        const feedback = wordleFeedback(guess.toUpperCase(), correct);
        
        const isCorrect = guess.toUpperCase() === correct;
        roomData.guessCount++;
        
        io.to(room).emit("result", { guess: guess.toUpperCase(), feedback, isCorrect });

        if (isCorrect || roomData.guessCount >= 6) {
            
            let winnerId = null;
            if (isCorrect) {
                roomData.scores[socketId] += (7 - roomData.guessCount);
                winnerId = socketId;
            }

            const newSetterId = roomData.guesserId; 
            const newGuesserId = roomData.setterId; 

            roomData.setterId = newSetterId;
            roomData.guesserId = newGuesserId;
            roomData.word = null;

            io.to(room).emit("gameOver", { 
                winnerId: winnerId, 
                newSetterId: newSetterId,
                scores: roomData.scores,
                usernames: roomData.usernames, // <--- FIX: Send current usernames list
                lostOnGuessCount: roomData.guessCount >= 6 && !isCorrect
            });
        }
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

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Running on ${PORT}`));