const socket = io();

let roomCode = "";
let secretWord = "";

document.getElementById("createRoomBtn").onclick = () => {
  socket.emit("create-room");
};

socket.on("room-created", (code) => {
  roomCode = code;
  alert("Room created! Share this code: " + code);
});

document.getElementById("joinRoomBtn").onclick = () => {
  let code = document.getElementById("roomCodeInput").value;
  socket.emit("join-room", code);
};

socket.on("start-game", (word) => {
  secretWord = word;
  alert("Game Started! Word selected.");
  showInput();
});

socket.on("room-error", (msg) => alert(msg));

function showInput() {
  document.getElementById("game").innerHTML = `
    <input id="guessInput" maxlength="5" style="text-transform:uppercase;">
    <button onclick="sendGuess()">Guess</button>
  `;
}

function sendGuess() {
  let guess = document.getElementById("guessInput").value.toUpperCase();
  if (guess.length !== 5) return alert("Enter 5 letters!");

  socket.emit("guess", { room: roomCode, guess: guess });
  checkGuess(guess);
}

socket.on("opponent-guess", (data) => {
  if (data.guess === secretWord) {
    alert("Opponent found the word!");
  }
});

function checkGuess(g) {
  if (g === secretWord) {
    alert("You found the word!");
  }
}
