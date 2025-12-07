const socket = io();

let room = "";
let currentRow = 0;
let currentTile = 0; // Tracks the current tile within the current row (0-4)
let mySocketId = "";
let usernames = {};
let isMyTurnToSet = false;
let isMyTurnToGuess = false;
let messageTimeout; 

// The current word being typed by the user
let currentGuess = ""; 
const MAX_WORD_LENGTH = 5;

// --- INITIAL SETUP ---
document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");

// Add event listener for the physical keyboard (The Professional Touch!)
document.addEventListener('keydown', (event) => {
    // Only process input if it's the player's turn to guess
    if (isMyTurnToGuess) {
        processKey(event.key.toUpperCase());
    }
});

// Add event listener for the virtual keyboard
document.getElementById('keyboard').addEventListener('click', (event) => {
    if (event.target.classList.contains('key') && isMyTurnToGuess) {
        processKey(event.target.dataset.key);
    }
});


// --- CORE INPUT LOGIC ---

function processKey(key) {
    if (!isMyTurnToGuess) return; // Ignore input if not guessing

    const letter = key.length === 1 && key.match(/[A-Z]/);

    if (letter && currentGuess.length < MAX_WORD_LENGTH) {
        // Handle letter input
        currentGuess += key;
        updateBoardInput(currentGuess);
    } else if (key === "BACKSPACE" || key === "DELETE") {
        // Handle backspace
        currentGuess = currentGuess.slice(0, -1);
        updateBoardInput(currentGuess);
    } else if (key === "ENTER" && currentGuess.length === MAX_WORD_LENGTH) {
        // Handle guess submission
        socket.emit("guess", { room, guess: currentGuess });
    } else if (key === "ENTER") {
        displayMessage("Guess must be 5 letters long.");
    }
}

function updateBoardInput(guess) {
    const board = document.querySelectorAll(".tile");
    const startTileIndex = currentRow * MAX_WORD_LENGTH;

    // Clear the current row visually
    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        board[startTileIndex + i].innerText = "";
    }

    // Fill the current row with the new guess
    for (let i = 0; i < guess.length; i++) {
        board[startTileIndex + i].innerText = guess[i];
    }
}


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
    currentGuess = "";
    const board = document.getElementById("board");
    board.innerHTML = Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");
}

function resetKeyboard() {
    document.querySelectorAll('.key').forEach(key => {
        key.classList.remove('correct', 'present', 'absent');
    });
}

function updateKeyboardDisplay(feedback, guess) {
    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        const keyEl = document.querySelector(`.key[data-key="${guess[i]}"]`);
        if (keyEl) {
            // Remove previous color classes
            keyEl.classList.remove('correct', 'present', 'absent');
            // Add the highest priority class
            keyEl.classList.add(feedback[i]);
        }
    }
}

function updateScoreDisplay(scores) {
    const scoreDisplay = document.getElementById("scoreDisplay");
    let scoreText = "Scores: ";
    for (const [id, score] of Object.entries(scores)) {
        scoreText += `${usernames[id]}: ${score} | `;
    }
    scoreDisplay.innerText = scoreText.slice(0, -2); // Remove trailing ' | '
}

function updateGameUI(isWordSet = true) {
    const setWordInput = document.getElementById("secretWordInput");
    const setWordBtn = document.getElementById("createRoomBtn");
    const statusEl = document.getElementById("gameStatus");
    const keyboardEl = document.getElementById("keyboard");

    // Disable everything by default
    setWordInput.disabled = true;
    setWordBtn.disabled = true;
    keyboardEl.style.opacity = 0.5; // Dim keyboard

    if (isMyTurnToSet) {
        setWordInput.disabled = false;
        setWordBtn.disabled = false;
        statusEl.innerText = "YOUR TURN: Set the secret word (5 letters) for your opponent!";
        keyboardEl.style.opacity = 0.2; // Dim keyboard heavily when setting word
    } else if (isMyTurnToGuess) {
        if (isWordSet) { 
             keyboardEl.style.opacity = 1; // Full brightness for keyboard
             statusEl.innerText = "YOUR TURN: Guess the word using your keyboard!";
        } else {
            statusEl.innerText = `Opponent is setting the word...`;
            keyboardEl.style.opacity = 0.2;
        }
    } else if (room) {
         statusEl.innerText = "Waiting for game to start...";
    }
}

// --- Handlers for User Actions ---

document.getElementById("createRoomBtn").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    const secretWord = document.getElementById("secretWordInput").value.trim();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    if (secretWord.length !== 5) return displayMessage("Secret word must be 5 letters!");

    if (!room) {
        socket.emit("createRoom", { secretWord, username });
    } else if (isMyTurnToSet) { 
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


// --- Socket Event Listeners ---

function updateRoomDisplay() {
    let playerNames = Object.values(usernames).join(" vs. ");
    document.getElementById("roomDisplay").innerText = `Room: ${room} | Players: ${playerNames}`;
}

socket.on("roomCreated", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = true; 
    updateRoomDisplay();
    updateGameUI(false); 
    displayMessage(`Room created! Share code: ${code}`);
});

socket.on("joinedRoom", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = false;
    updateRoomDisplay();
    updateGameUI(true); 
    displayMessage(`Joined room: ${code}. Get ready to guess!`);
});

socket.on("gameStart", ({ setter, guesser, usernames }) => {
    isMyTurnToSet = (mySocketId === setter);
    isMyTurnToGuess = (mySocketId === guesser);
    updateScoreDisplay({});
    resetBoard();
    resetKeyboard();
    updateGameUI(true); 
    displayMessage(`Game started! ${usernames[setter]} is the setter. ${usernames[guesser]} guesses first.`);
});

socket.on("wordSet", ({ setterId }) => {
    isMyTurnToSet = (mySocketId === setterId);
    isMyTurnToGuess = (mySocketId !== setterId);
    resetBoard();
    updateGameUI(true); 
    displayMessage("New secret word set! It's time to guess!");
});

socket.on("result", ({ guess, feedback, isCorrect }) => {
    let board = document.querySelectorAll(".tile");
    updateKeyboardDisplay(feedback, guess); // Color the keyboard!

    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        const tile = board[currentRow * MAX_WORD_LENGTH + i];
        tile.innerText = guess[i];
        tile.classList.add(feedback[i]); 
    }
    
    // Only clear input and advance row if the guess was successful
    if (!isCorrect && currentRow < 5) {
        currentRow++;
        currentGuess = ""; // Ready for the next guess
    }
});

socket.on("gameOver", ({ winnerId, newSetterId, scores, lostOnGuessCount }) => {
    updateScoreDisplay(scores);
    
    if (lostOnGuessCount) {
        displayMessage("Ran out of guesses! Points lost. The word was not guessed.", 5000); 
    } else if (winnerId === mySocketId) {
        displayMessage(`CORRECT! You won the round!`, 5000); 
    } else if (winnerId) {
        displayMessage(`Your opponent (${usernames[winnerId]}) won the round!`, 5000); 
    } else {
        displayMessage("Round over. No points scored.", 5000);
    }
    
    // Switch turns for the next round
    isMyTurnToSet = (mySocketId === newSetterId);
    isMyTurnToGuess = (mySocketId !== newSetterId);
    
    resetBoard();
    resetKeyboard();
    updateGameUI(false); // Word is null; next round requires new setter to input the word
});


// --- Error Handlers ---
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full.")); 
socket.on("opponentLeft", () => displayMessage("Your opponent left the game!"));