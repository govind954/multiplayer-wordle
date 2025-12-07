const socket = io();

let room = "";
let currentRow = 0;
let mySocketId = "";
let usernames = {};

// Helper function placeholder (will be fully implemented in Phase 2)
function displayMessage(text, duration = 3000) {
    const msgEl = document.getElementById("messageDisplay");
    msgEl.innerText = text;
    setTimeout(() => { msgEl.innerText = ""; }, duration);
}

document.getElementById("board").innerHTML =
  Array(30).fill(0).map(() => `<div class="tile"></div>`).join("");

// --- Handlers for User Actions ---

document.getElementById("createRoom").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    const secretWord = document.getElementById("secretWordInput").value.toUpperCase();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    if (secretWord.length !== 5) return displayMessage("Secret word must be 5 letters!");

    socket.emit("createRoom", { secretWord, username });
};

document.getElementById("joinRoomBtn").onclick = () => {
    const username = document.getElementById("usernameInput").value.trim();
    room = document.getElementById("roomInput").value.toUpperCase();
    
    if (!username || username.length < 3) return displayMessage("Please enter a username (3+ letters).");
    if (!room) return displayMessage("Please enter a Room Code.");
    
    socket.emit("joinRoom", { code: room, username });
};


document.getElementById("guessBtn").onclick = () => {
    const guess = document.getElementById("guessInput").value.toUpperCase();
    if (guess.length !== 5) return displayMessage("5 letters only!");

    socket.emit("guess", { room, guess });
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
    updateRoomDisplay();
    displayMessage(`Room created! Share code: ${code}`);
});

socket.on("joinedRoom", (code, socketId, userList) => {
    room = code;
    mySocketId = socketId;
    usernames = userList;
    updateRoomDisplay();
    displayMessage(`Joined room: ${code}. Waiting for game start...`);
});

socket.on("gameStart", ({ setter, guesser, usernames }) => {
    // Phase 2 will implement logic here to show turn status
    displayMessage(`Game started! ${usernames[setter]} is setting the word, ${usernames[guesser]} is guessing.`);
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

// Phase 2 additions
socket.on("errorMsg", (message) => displayMessage("Error: " + message)); 
socket.on("roomNotFound", () => displayMessage("Room not found.")); 
socket.on("roomFull", () => displayMessage("This room is full.")); 
socket.on("opponentLeft", () => displayMessage("Your opponent left the game!"));