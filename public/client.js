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


// --- CORE INPUT LOGIC ---

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
        // Remove color/animation classes on backspace
        board[startTileIndex + i].classList.remove('flip-in', 'flip-out', 'correct', 'present', 'absent'); 
    }

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
            keyEl.classList.remove('correct', 'present', 'absent');
            keyEl.classList.add(feedback[i]);
        }
    }
}

function updateScoreDisplay(scores) {
    const scoreDisplay = document.getElementById("scoreDisplay");
    let scoreText = "Scores: ";
    for (const [id, score] of Object.entries(scores)) {
        // Use a fallback for undefined usernames (though the server fix should prevent this)
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
         statusEl.innerText = "Waiting for game to start...";
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

socket.on("result", ({ guess, feedback }) => {
    let board = document.querySelectorAll(".tile");
    updateKeyboardDisplay(feedback, guess);

    // Apply the staggered flip animation for polish!
    for (let i = 0; i < MAX_WORD_LENGTH; i++) {
        const tile = board[currentRow * MAX_WORD_LENGTH + i];
        
        // 1. Set the letter immediately
        tile.innerText = guess[i];
        
        // 2. Start the animation and color change with a delay
        setTimeout(() => {
            tile.classList.add('flip-in'); 
            
            setTimeout(() => {
                tile.classList.add(feedback[i], 'flip-out'); // Add color and flip-out
            }, 300); // Wait for flip-in to complete
            
        }, i * 350); // Stagger start time
    }
    
    // Clear input and advance row *after* all animations have time to start
    setTimeout(() => {
        currentRow++;
        currentGuess = "";
    }, MAX_WORD_LENGTH * 350); // Wait for the last animation to start
});

socket.on("gameOver", ({ winnerId, newSetterId, scores, usernames: newUsers, lostOnGuessCount }) => {
    // *** FIX: Update local usernames list before updating scores/display ***
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
    
    // Wait for the last row animation to finish before resetting the board
    setTimeout(() => {
        isMyTurnToSet = (mySocketId === newSetterId);
        isMyTurnToGuess = (mySocketId !== newSetterId);
        resetBoard();
        resetKeyboard();
        updateGameUI(false); 
    }, 2000); // 2 seconds allows all tile animations to complete
});


// --- Error Handlers ---
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full.")); 
socket.on("opponentLeft", () => displayMessage("Your opponent left the game!"));