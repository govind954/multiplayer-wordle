const socket = io();

let room = "";
let currentRow = 0;
let currentTile = 0;
let mySocketId = "";
let usernames = {};
let isMyTurnToSet = false;
let isMyTurnToGuess = false;
let messageTimeout; 

let currentGuess = ""; 
const MAX_WORD_LENGTH = 5;

// --- DOM References ---
const lobbyControls = document.getElementById("lobby-controls");
const gameContainer = document.getElementById("game-container");
const setWordControls = document.getElementById("setWordControls"); // NEW

// --- INITIAL SETUP ---
document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");

// Event listener for the physical keyboard
document.addEventListener('keydown', (event) => {
    if (isMyTurnToGuess) {
        processKey(event.key.toUpperCase());
    }
});

// Event listener for the virtual keyboard
document.getElementById('keyboard').addEventListener('click', (event) => {
    if (event.target.classList.contains('key') && isMyTurnToGuess) {
        processKey(event.target.dataset.key);
    }
});


// --- LOBBY/GAME VISIBILITY ---

function showGame() {
    lobbyControls.style.display = 'none';
    gameContainer.style.display = 'block';
}

function showLobby() {
    lobbyControls.style.display = 'block';
    gameContainer.style.display = 'none';
    document.getElementById("gameStatus").innerText = "Enter username to start.";
}


// --- CORE INPUT LOGIC (Unchanged) ---

function processKey(key) {
    if (!isMyTurnToGuess) return;

    const letter = key.length === 1 && key.match(/[A-Z]/);

    if (letter && currentGuess.length < MAX_WORD_LENGTH) {
        currentGuess += key;
        updateBoardInput(currentGuess);
    } else if (key === "BACKSPACE" || key === "DELETE") {
        currentGuess = currentGuess.slice(0, -1);
        updateBoardInput(currentGuess);
    } else if (key === "ENTER" && currentGuess.length === MAX_WORD_LENGTH) {
        socket.emit("guess", { room, guess: currentGuess });
    } else if (key === "ENTER") {
        displayMessage("Guess must be 5 letters long.");
    }
}

function updateBoardInput(guess) {
    const board = document.querySelectorAll(".tile");
    const startTileIndex = currentRow * MAX_WORD_LENGTH;

    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        board[startTileIndex + i].innerText = "";
        board[startTileIndex + i].classList.remove('flip-in', 'flip-out', 'correct', 'present', 'absent'); 
    }

    for (let i = 0; i < guess.length; i++) {
        board[startTileIndex + i].innerText = guess[i];
    }
}


// --- UI/UX Functions (Updated to handle new control location) ---

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
            keyEl.classList.remove('correct', 'present', 'absent');
            keyEl.classList.add(feedback[i]);
        }
    }
}

function updateScoreDisplay(scores) {
    const scoreDisplay = document.getElementById("scoreDisplay");
    let scoreText = "Scores: ";
    for (const [id, score] of Object.entries(scores)) {
        const name = usernames[id] || "Unknown Player"; 
        scoreText += `${name}: ${score} | `;
    }
    scoreDisplay.innerText = scoreText.slice(0, -2);
}

function updateGameUI(isWordSet = true) {
    const secretWordInput = document.getElementById("secretWordInput");
    const setNextWordBtn = document.getElementById("setNextWordBtn");
    const statusEl = document.getElementById("gameStatus");
    const keyboardEl = document.getElementById("keyboard");

    // Hide set word controls and disable keyboard by default
    setWordControls.style.display = 'none';
    keyboardEl.style.opacity = 0.5;
    
    // --- Determine State ---
    if (isMyTurnToSet) {
        // Show set word controls
        setWordControls.style.display = 'block';
        secretWordInput.disabled = false;
        setNextWordBtn.disabled = false;
        
        // Hide game board and show status
        statusEl.innerText = "YOUR TURN: Set the secret word (5 letters)!";
        
    } else if (isMyTurnToGuess) {
        if (isWordSet) { 
             // Show keyboard for guessing
             keyboardEl.style.opacity = 1;
             statusEl.innerText = "YOUR TURN: Guess the word using your keyboard!";
        } else {
            // Wait for opponent to set word
            statusEl.innerText = `Opponent is setting the word...`;
            keyboardEl.style.opacity = 0.2;
        }
    } else if (room) {
        statusEl.innerText = "Waiting for opponent to join..."; 
    }
}


// --- Handlers for User Actions (Updated to reference new button ID) ---

// This handler now ONLY deals with creating the room for the very first time.
document.getElementById("joinRoomBtn").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    const roomCode = document.getElementById("roomInput").value.toUpperCase();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    // If the room code is empty, we assume they want to CREATE the room.
    if (!roomCode) {
        // They are creating the room. We need a dummy word here for the server to process.
        // The *actual* word is set via the setNextWordBtn logic later.
        socket.emit("createRoom", { secretWord: "START", username }); 
    } else {
        // They are joining an existing room
        socket.emit("joinRoom", { code: roomCode, username });
    }
};

// NEW Handler for setting the word after the first round, or initial word set
document.getElementById("setNextWordBtn").onclick = () => {
    const secretWord = document.getElementById("secretWordInput").value.trim();
    
    if (secretWord.length !== 5) return displayMessage("Secret word must be 5 letters!");

    if (isMyTurnToSet) { 
        socket.emit("setNextWord", { room, secretWord });
        document.getElementById("secretWordInput").value = "";
    }
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
    isMyTurnToSet = true; // Creator is the first Setter
    
    showGame(); 
    updateRoomDisplay();
    // Pass true for isWordSet status to show the Setter controls immediately
    updateGameUI(true); 
    displayMessage(`Room created! Share code: ${code}`);
});

socket.on("joinedRoom", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = false;
    
    showGame(); 
    updateRoomDisplay();
    updateGameUI(true); // Game starts immediately upon join
    displayMessage(`Joined room: ${code}. Game is starting!`);
});

socket.on("gameStart", ({ setter, guesser, usernames: newUsers }) => {
    // Update usernames globally
    usernames = newUsers; 
    
    isMyTurnToSet = (mySocketId === setter);
    isMyTurnToGuess = (mySocketId === guesser);
    updateScoreDisplay({});
    resetBoard();
    resetKeyboard();
    // The game starts, meaning the word is set (either START or a real word)
    updateGameUI(true); 
    displayMessage(`Game started! ${usernames[setter]} is the setter. ${usernames[guesser]} guesses first.`);
});

socket.on("wordSet", ({ setterId }) => {
    isMyTurnToSet = (mySocketId === setterId);
    isMyTurnToGuess = (mySocketId !== setterId);
    resetBoard();
    updateGameUI(true); // Word is now set, so start guessing UI
    displayMessage("New secret word set! It's time to guess!");
});

socket.on("result", ({ guess, feedback }) => {
    let board = document.querySelectorAll(".tile");
    updateKeyboardDisplay(feedback, guess);

    // Apply the staggered flip animation 
    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        const tile = board[currentRow * MAX_WORD_LENGTH + i];
        
        tile.innerText = guess[i];
        
        setTimeout(() => {
            tile.classList.add('flip-in'); 
            
            setTimeout(() => {
                tile.classList.add(feedback[i], 'flip-out'); 
            }, 300); 
            
        }, i * 350); 
    }
    
    setTimeout(() => {
        currentRow++;
        currentGuess = "";
    }, MAX_WORD_LENGTH * 350);
});

socket.on("gameOver", ({ winnerId, newSetterId, scores, usernames: newUsers, lostOnGuessCount }) => {
    usernames = newUsers;
    updateScoreDisplay(scores);
    updateRoomDisplay();
    
    let message = "Round over. No points scored.";
    if (lostOnGuessCount) {
        message = "Ran out of guesses! Points lost. The word was not guessed.";
    } else if (winnerId === mySocketId) {
        message = `CORRECT! You won the round!`;
    } else if (winnerId) {
        message = `Your opponent (${usernames[winnerId] || 'Unknown'}) won the round!`; 
    }
    displayMessage(message, 5000);
    
    // Wait for animation, then reset and prepare for the next round
    setTimeout(() => {
        isMyTurnToSet = (mySocketId === newSetterId);
        isMyTurnToGuess = (mySocketId !== newSetterId);
        resetBoard();
        resetKeyboard();
        updateGameUI(false); // New word is NOT set yet, must wait for Setter
    }, 2000); 
});


// --- Error Handlers ---
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full.")); 
socket.on("opponentLeft", () => {
    displayMessage("Your opponent left the game!", 5000);
    showLobby();
});