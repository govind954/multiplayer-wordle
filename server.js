const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let rooms = {};
let users = {}; // Global user tracking by socket ID

// --- Temporary/Example Word List ---
// IMPORTANT: Replace this small list with a massive array of 5-letter words (5000+)
const VALID_WORDS = [
    "ADIEU", "APPLE", "BEACH", "CHAIR", "TABLE", "PLANT", "START", "WORLD", 
    "RIVER", "TRAIN", "HOUSE", "GRADE", "SMILE", "QUIET", "BLANK"
];
// ------------------------------------

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
    const socketId = socket.id;

    // --- GAME ROOM & USER MANAGEMENT ---

    socket.on("createRoom", ({ username }) => {
        const code = generateCode();
        users[socketId] = username;

        rooms[code] = { 
            word: null, // Initial word is null, set by the creator using setNextWord
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
        const room = rooms[code];
        if (!room) return socket.emit("roomNotFound");
        if (room.players.length >= 2) return socket.emit("roomFull");

        users[socketId] = username;
        room.players.push(socketId);
        room.usernames[socketId] = username;
        room.scores[socketId] = 0;
        room.guesserId = socketId; // The joiner is the guesser for the first round
        
        socket.join(code);
        
        // Notify the new player they joined
        socket.emit("joinedRoom", code, socketId, room.usernames);
        
        // Notify everyone that the game is ready (Setter is room.setterId, Guesser is socketId)
        io.to(code).emit("gameStart", { 
            setter: room.setterId, 
            guesser: room.guesserId, 
            usernames: room.usernames
        });
    });

    socket.on("setNextWord", ({ room: code, secretWord }) => {
        const room = rooms[code];
        if (!room || room.setterId !== socketId) return socket.emit("errorMsg", "Not your turn to set the word.");
        if (secretWord.length !== 5 || !VALID_WORDS.includes(secretWord.toUpperCase())) {
            return socket.emit("errorMsg", "Invalid word. Must be 5 letters and in the dictionary.");
        }

        room.word = secretWord.toUpperCase();
        room.guessCount = 0;
        
        // Switch roles for the next round
        const oldSetter = room.setterId;
        const newSetter = room.guesserId; 
        room.setterId = newSetter;
        room.guesserId = oldSetter;

        // Notify both clients that the word is set (they will handle UI reset)
        io.to(code).emit("wordSet", { setterId: room.setterId });
    });


    // --- GUESSING LOGIC (WITH VALIDATION) ---
    
    socket.on("guess", ({ room: code, guess }) => {
        const room = rooms[code];
        const normalizedGuess = guess.toUpperCase();

        if (!room || room.guesserId !== socketId) return socket.emit("errorMsg", "It is not your turn to guess.");
        if (!room.word) return socket.emit("errorMsg", "The word has not been set yet!");
        
        // 🛑 NEW VALIDATION CHECK 🛑
        if (normalizedGuess.length !== 5 || !VALID_WORDS.includes(normalizedGuess)) {
            // Emit new event for the client to shake the board
            return socket.emit("invalidGuess"); 
        }

        const correct = room.word;
        const feedback = wordleFeedback(normalizedGuess, correct);
        room.guessCount++;

        // Send feedback to both players
        io.to(code).emit("result", { guess: normalizedGuess, feedback });
        
        // Check for win condition
        if (feedback.every(f => f === "correct")) {
            const winnerId = room.guesserId;
            room.scores[winnerId] += 1;
            
            // newSetterId is the player who just guessed (the guesser)
            const newSetterId = room.guesserId;
            
            io.to(code).emit("gameOver", { 
                winnerId: winnerId, 
                newSetterId: newSetterId,
                scores: room.scores,
                usernames: room.usernames,
                lostOnGuessCount: false
            });
            return;
        }

        // Check for loss condition (6 guesses)
        if (room.guessCount >= 6) {
            // New setter is the player who was previously the setter
            const newSetterId = room.setterId; 

            io.to(code).emit("gameOver", { 
                winnerId: null, // No winner
                newSetterId: newSetterId,
                scores: room.scores,
                usernames: room.usernames,
                lostOnGuessCount: true
            });
            return;
        }
        
    });

    // --- DISCONNECT ---

    socket.on('disconnect', () => {
        // Find and clean up room if player leaves
        for (const code in rooms) {
            const room = rooms[code];
            const playerIndex = room.players.indexOf(socketId);

            if (playerIndex > -1) {
                // Remove player
                room.players.splice(playerIndex, 1);
                delete room.usernames[socketId];

                if (room.players.length === 0) {
                    // Delete the room if it's empty
                    delete rooms[code];
                } else {
                    // Notify the remaining player that the opponent left
                    io.to(code).emit("opponentLeft");
                    // Ensure the room is deleted after notifying
                    delete rooms[code];
                }
                break;
            }
        }
        delete users[socketId];
    });
});

http.listen(3000, () => console.log("Running on 3000"));