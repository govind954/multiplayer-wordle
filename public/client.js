const socket = io();

let room = "";
let currentRow = 0;
let mySocketId = "";
let isMyTurnToSet = false;
let isMyTurnToGuess = false;
let messageTimeout; 

document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");


// New function to display a message without using alert()
function displayMessage(text, duration = 3000) {
    clearTimeout(messageTimeout);
    const msgEl = document.getElementById("messageDisplay");
    msgEl.innerText = text;
    // Clear the message after the duration (default 3 seconds)
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
        scoreText += `${id.substring(0, 4)}: ${score} | `;
    }
    scoreDisplay.innerText = scoreText;
}

function updateGameUI(isWordSet = true) {
    const setWordInput = document.getElementById("secretWordInput");
    const setWordBtn = document.getElementById("createRoom");
    const guessInput = document.getElementById("guessInput");
    const guessBtn = document.getElementById("guessBtn");
    const statusEl = document.getElementById("gameStatus");

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
            statusEl.innerText = "Opponent's Turn: Waiting for them to set the secret word...";
        }
    } else if (room) {
         statusEl.innerText = "Waiting for game to start or opponent to set the word...";
    }
}


document.getElementById("createRoom").onclick = () => {
    const secretWord = document.getElementById("secretWordInput").value.toUpperCase();
    
    if (secretWord.length !== 5) {
        return displayMessage("Secret word must be 5 letters!");
    }
    
    // Initial room creation
    if (!room) {
        socket.emit("createRoom", secretWord);
    } 
    // Setting word for the next round
    else if (isMyTurnToSet) { 
        socket.emit("setNextWord", { room, secretWord });
        document.getElementById("secretWordInput").value = "";
    }
};

document.getElementById("joinRoom").onclick = () => {
    room = document.getElementById("roomInput").value.toUpperCase();
    socket.emit("joinRoom", room);
};

socket.on("roomCreated", (code, socketId) => {
    room = code;
    mySocketId = socketId; 
    isMyTurnToSet = true; 
    document.getElementById("roomDisplay").innerText = "Room: " + room + " (Your ID: " + mySocketId.substring(0, 4) + ")";
    updateGameUI();
    displayMessage("Room created! Share this code: " + code, 5000);
});

socket.on("joinedRoom", (code, socketId) => {
    room = code;
    mySocketId = socketId; 
    isMyTurnToSet = false;
    document.getElementById("roomDisplay").innerText = "Room: " + room + " (Your ID: " + mySocketId.substring(0, 4) + ")";
    updateGameUI(false); // Game starts with word already set by creator, so pass true later
    displayMessage("Successfully joined room: " + code);
});

socket.on("gameStart", ({ setter, guesser }) => {
    // Initial assignment of turns (word is already set by the creator)
    isMyTurnToSet = (mySocketId === setter);
    isMyTurnToGuess = (mySocketId === guesser);
    resetBoard();
    updateGameUI(true); 
    displayMessage("Game started! The creator has set the first word.");
});

// Event when the setter inputs the word for a subsequent round
socket.on("wordSet", ({ setterId }) => {
    // The player who just set the word is the setter; the other player is the guesser.
    isMyTurnToSet = (mySocketId === setterId);
    isMyTurnToGuess = (mySocketId !== setterId);
    resetBoard();
    updateGameUI(true); // Word is now set, so guessing is enabled
    displayMessage("New secret word set! It's time to guess!");
});


document.getElementById("guessBtn").onclick = () => {
    const guess = document.getElementById("guessInput").value.toUpperCase();
    if (guess.length !== 5) return displayMessage("Guess must be 5 letters!");
    if (!room) return displayMessage("Please create or join a room first.");

    socket.emit("guess", { room, guess });
    document.getElementById("guessInput").value = ""; 
};

socket.on("result", ({ guess, feedback, isCorrect }) => {
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
        displayMessage("CORRECT! You won the round and scored points!", 5000); 
    } else {
        displayMessage("Your opponent won the round and scored points!", 5000); 
    }
    
    // Switch turns for the next round
    isMyTurnToSet = (mySocketId === newSetterId);
    isMyTurnToGuess = (mySocketId !== newSetterId);
    
    resetBoard();
    // Pass 'false' because the word is now NULL on the server and must be set
    updateGameUI(false); 
});


// --- KEYBOARD ENTRY LOGIC ---

const handleGuess = () => {
    if (!document.getElementById("guessBtn").disabled) {
        document.getElementById("guessBtn").click();
    }
}

const handleSetWord = () => {
    if (!document.getElementById("createRoom").disabled) {
        document.getElementById("createRoom").click();
    }
}

document.getElementById("guessInput").addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
        handleGuess();
    }
});

document.getElementById("secretWordInput").addEventListener("keyup", function(event) {
    if (event.key === "Enter") {
        handleSetWord();
    }
});

socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found. Check the code.")); 
socket.on("roomFull", () => displayMessage("This room is already full.")); 
socket.on("opponentLeft", () => displayMessage("Your opponent left the game!"));