const socket = io();

let room = "";
let currentRow = 0;
let mySocketId = "";
let usernames = {};
let isMyTurnToSet = false;
let isMyTurnToGuess = false;
let messageTimeout; 

document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");


// --- UI/UX Functions ---

function displayMessage(text, duration = 3000) {
    clearTimeout(messageTimeout);
    const msgEl = document.getElementById("messageDisplay");
    msgEl.innerText = text;
    messageTimeout = setTimeout(() => {
        msgEl.innerText = "";
    }, duration);
}

function resetBoard() {
    currentRow = 0;
    const board = document.getElementById("board");
    board.innerHTML = Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");
}

function updateScoreDisplay(scores) {
    const scoreDisplay = document.getElementById("scoreDisplay");
    let scoreText = "Scores: ";
    for (const [id, score] of Object.entries(scores)) {
        scoreText += `${usernames[id]}: ${score} | `;
    }
    scoreDisplay.innerText = scoreText;
}

function updateGameUI(isWordSet = true) {
    const setWordInput = document.getElementById("secretWordInput");
    const setWordBtn = document.getElementById("createRoomBtn");
    const guessInput = document.getElementById("guessInput");
    const guessBtn = document.getElementById("guessBtn");
    const statusEl = document.getElementById("gameStatus");

    // Disable everything by default
    setWordInput.disabled = true;
    setWordBtn.disabled = true;
    guessInput.disabled = true;
    guessBtn.disabled = true;

    if (isMyTurnToSet) {
        setWordInput.disabled = false;
        setWordBtn.disabled = false;
        statusEl.innerText = "YOUR TURN: Set the secret word (5 letters) for your opponent!";
        guessInput.value = "";
    } else if (isMyTurnToGuess) {
        if (isWordSet) { 
             guessInput.disabled = false;
             guessBtn.disabled = false;
             statusEl.innerText = "YOUR TURN: Guess the word!";
             setWordInput.value = "";
        } else {
            statusEl.innerText = `Opponent (${usernames[mySocketId !== undefined ? getOpponentId() : null]}) is setting the word...`;
        }
    } else if (room) {
         statusEl.innerText = "Waiting for game to start or opponent to set the word...";
    }
}

function getOpponentId() {
    for (const id in usernames) {
        if (id !== mySocketId) return id;
    }
    return null;
}

// --- Handlers for User Actions ---

document.getElementById("createRoomBtn").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    const secretWord = document.getElementById("secretWordInput").value.trim();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    if (secretWord.length !== 5) return displayMessage("Secret word must be 5 letters!");
    
    if (!room) {
        // Initial room creation
        socket.emit("createRoom", { secretWord, username });
    } else if (isMyTurnToSet) { 
        // Setting word for the next round
        socket.emit("setNextWord", { room, secretWord });
        document.getElementById("secretWordInput").value = "";
    }
};

document.getElementById("joinRoomBtn").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    room = document.getElementById("roomInput").value.toUpperCase();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    if (!room) return displayMessage("Please enter a Room Code.");
    
    socket.emit("joinRoom", { code: room, username });
};


document.getElementById("guessBtn").onclick = () => {
    const guess = document.getElementById("guessInput").value.trim();
    if (guess.length !== 5) return displayMessage("5 letters only!");

    socket.emit("guess", { room, guess });
    document.getElementById("guessInput").value = ""; 
};

// --- Socket Event Listeners ---

function updateRoomDisplay() {
    let playerNames = Object.values(usernames).join(" vs. ");
    document.getElementById("roomDisplay").innerText = `Room: ${room} | Players: ${playerNames}`;
}

socket.on("roomCreated", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = true; // Creator is the first setter
    updateRoomDisplay();
    updateGameUI(false); // Game state is not fully set until opponent joins
    displayMessage(`Room created! Share code: ${code}`);
});

socket.on("joinedRoom", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = false;
    updateRoomDisplay();
    updateGameUI(true); // Guesser joins, word is already set by creator
    displayMessage(`Joined room: ${code}. Get ready to guess!`);
});

socket.on("gameStart", ({ setter, guesser, usernames }) => {
    // Initial assignment of turns (word is already set by the creator)
    isMyTurnToSet = (mySocketId === setter);
    isMyTurnToGuess = (mySocketId === guesser);
    updateScoreDisplay({}); // Start with empty scores
    resetBoard();
    updateGameUI(true); 
    displayMessage(`Game started! ${usernames[setter]} is the setter. ${usernames[guesser]} guesses first.`);
});

socket.on("wordSet", ({ setterId }) => {
    // Roles flip based on the new setter (which is the old guesser)
    isMyTurnToSet = (mySocketId === setterId);
    isMyTurnToGuess = (mySocketId !== setterId);
    resetBoard();
    updateGameUI(true); // Word is now set, guessing is enabled
    displayMessage("New secret word set! It's time to guess!");
});

socket.on("result", ({ guess, feedback }) => {
    let board = document.querySelectorAll(".tile");

    for (let i = 0; i < 5; i++) {
        const tile = board[currentRow * 5 + i];
        tile.innerText = guess[i];
        tile.classList.add(feedback[i]); 
    }
    currentRow++;
});

socket.on("gameOver", ({ winnerId, newSetterId, scores, lostOnGuessCount }) => {
    updateScoreDisplay(scores);
    
    if (lostOnGuessCount) {
        displayMessage("Ran out of guesses! Points lost. The word was not guessed.", 5000); 
    } else if (winnerId === mySocketId) {
        displayMessage(`CORRECT! You won the round and scored ${7 - currentRow} points!`, 5000); 
    } else {
        displayMessage(`Your opponent (${usernames[winnerId]}) won the round!`, 5000); 
    }
    
    // Switch turns for the next round
    isMyTurnToSet = (mySocketId === newSetterId);
    isMyTurnToGuess = (mySocketId !== newSetterId);
    
    resetBoard();
    updateGameUI(false); // Word is null; next round requires new setter to input the word
});


// --- Error Handlers ---
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full.")); 
socket.on("opponentLeft", () => displayMessage("Your opponent left the game!"));