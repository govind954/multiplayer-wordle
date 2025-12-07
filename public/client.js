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

// --- INITIAL SETUP ---
document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");

document.addEventListener('keydown', (event) => {
    if (isMyTurnToGuess) {
        processKey(event.key.toUpperCase());
    }
});

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


// --- CORE INPUT LOGIC (Unchanged from Phase 3) ---

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


// --- UI/UX Functions (Mostly Unchanged) ---

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
    const setWordInput = document.getElementById("secretWordInput");
    const setWordBtn = document.getElementById("createRoomBtn");
    const statusEl = document.getElementById("gameStatus");
    const keyboardEl = document.getElementById("keyboard");

    setWordInput.disabled = true;
    setWordBtn.disabled = true;
    keyboardEl.style.opacity = 0.5;

    if (isMyTurnToSet) {
        setWordInput.disabled = false;
        setWordBtn.disabled = false;
        statusEl.innerText = "YOUR TURN: Set the secret word (5 letters)!";
        keyboardEl.style.opacity = 0.2;
    } else if (isMyTurnToGuess) {
        if (isWordSet) { 
             keyboardEl.style.opacity = 1;
             statusEl.innerText = "YOUR TURN: Guess the word using your keyboard!";
        } else {
            statusEl.innerText = `Opponent is setting the word...`;
            keyboardEl.style.opacity = 0.2;
        }
    } else if (room) {
        // Creator's state before the joiner arrives (CRITICAL FOR "CAN'T START" FIX)
        statusEl.innerText = "Waiting for opponent to join..."; 
    }
}

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
    
    showGame(); // <--- NEW: Hide Lobby
    
    updateRoomDisplay();
    updateGameUI(false); 
    displayMessage(`Room created! Share code: ${code}`);
    document.getElementById("gameStatus").innerText = "Waiting for opponent to join..."; // Set initial waiting message
});

socket.on("joinedRoom", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    isMyTurnToSet = false;
    
    showGame(); // <--- NEW: Hide Lobby
    
    updateRoomDisplay();
    updateGameUI(true); 
    displayMessage(`Joined room: ${code}. Game is starting!`);
});

// ... (rest of the socket listeners remain the same for gameStart, wordSet, result, gameOver)

socket.on("opponentLeft", () => {
    displayMessage("Your opponent left the game!", 5000);
    // Show lobby controls again so the user can start/join a new game
    showLobby(); // <--- NEW: Show Lobby on opponent disconnect
});

// --- Error Handlers (Unchanged) ---
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full."));