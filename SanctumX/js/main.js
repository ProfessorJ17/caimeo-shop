import { Board } from './board.js';
import { AI } from './ai.js';

const board = new Board();
const ai = new AI();
let selectedSquare = null;
let room = null;
let gameMode = 'singleplayer';
let playerColor = 'white';
let currentGameId = null;
let currentUsername = null;
let isAnonymous = false;

function generateGameId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function initMenu() {
  const startMenu = document.getElementById('startMenu');
  const gameContainer = document.getElementById('gameContainer');
  const singleplayerBtn = document.getElementById('singleplayerBtn');
  const createMultiplayerBtn = document.getElementById('createMultiplayerBtn');
  const joinMultiplayerBtn = document.getElementById('joinMultiplayerBtn');
  const backToMenuBtn = document.getElementById('backToMenuBtn');
  const anonymousLogin = document.getElementById('anonymousLogin');
  const usernameInput = document.getElementById('usernameInput');
  const setUsernameBtn = document.getElementById('setUsernameBtn');

  // Check if user is logged in to websim
  checkLoginStatus();

  function checkLoginStatus() {
    // Try to get username from websim
    const user = window.websim?.getUser?.();
    if (!user) {
      // Show anonymous login if not logged in
      isAnonymous = true;
      anonymousLogin.style.display = 'block';
      disableGameButtons();
    } else {
      currentUsername = user.username;
      isAnonymous = false;
      anonymousLogin.style.display = 'none';
      enableGameButtons();
    }
  }

  function disableGameButtons() {
    singleplayerBtn.disabled = true;
    createMultiplayerBtn.disabled = true;
    joinMultiplayerBtn.disabled = true;
    [singleplayerBtn, createMultiplayerBtn, joinMultiplayerBtn].forEach(btn => {
      btn.style.opacity = '0.5';
    });
  }

  function enableGameButtons() {
    singleplayerBtn.disabled = false;
    createMultiplayerBtn.disabled = false;
    joinMultiplayerBtn.disabled = false;
    [singleplayerBtn, createMultiplayerBtn, joinMultiplayerBtn].forEach(btn => {
      btn.style.opacity = '1';
    });
  }

  // Handle anonymous username setting
  setUsernameBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username.length >= 3 && username.length <= 20) {
      currentUsername = username;
      anonymousLogin.style.display = 'none';
      enableGameButtons();
    } else {
      alert('Username must be between 3 and 20 characters');
    }
  });

  // Initialize the rest of the menu
  singleplayerBtn.addEventListener('click', () => {
    gameMode = 'singleplayer';
    playerColor = 'white';
    startMenu.style.display = 'none';
    gameContainer.style.display = 'flex';
    initGame();
    initGameChat(); // Initialize game chat when switching to game view
  });

  createMultiplayerBtn.addEventListener('click', async () => {
    gameMode = 'multiplayer';
    playerColor = 'white';
    room = new WebsimSocket();
    
    // Create a unique short ID
    const shortId = generateGameId();
    
    // Create a new game record
    const game = await room.collection('chess_game').create({
      id: shortId, // Use our custom short ID
      status: 'waiting',
      white_player: isAnonymous ? currentUsername : room.party.client.username,
      black_player: null,
      moves: [],
      current_state: board.serialize()
    });

    currentGameId = shortId;

    // Listen for opponent joining
    room.collection('chess_game').filter({ id: shortId }).subscribe((games) => {
      if (games[0] && games[0].black_player) {
        startMultiplayerGame(games[0]);
      }
    });

    startMenu.style.display = 'none';
    gameContainer.style.display = 'flex';
    updateStatus("Waiting for opponent to join...");
    initGameChat();
    
    // Show shorter game ID for sharing
    alert(`Share this game ID with your opponent: ${shortId}`);
  });

  joinMultiplayerBtn.addEventListener('click', async () => {
    const gameId = prompt("Enter the game ID to join:").toLowerCase(); // Make case-insensitive
    if (!gameId) return;

    // Validate game ID format
    if (!/^[a-z0-9]{10}$/.test(gameId)) {
      alert("Invalid game ID format! It should be 10 characters long.");
      return;
    }

    gameMode = 'multiplayer';
    playerColor = 'black';
    room = new WebsimSocket();

    try {
      const games = await room.collection('chess_game').filter({ id: gameId }).getList();
      if (games.length === 0) {
        alert("Game not found! Please check the ID and try again.");
        return;
      }

      const game = games[0];
      if (game.black_player) {
        alert("Game already has two players!");
        return;
      }

      // Join the game
      await room.collection('chess_game').update(gameId, {
        black_player: isAnonymous ? currentUsername : room.party.client.username,
        status: 'playing'
      });

      currentGameId = gameId;

      startMultiplayerGame(game);
      startMenu.style.display = 'none';
      gameContainer.style.display = 'flex';
      initGameChat();
    } catch (error) {
      alert("Error joining game: " + error.message);
    }
  });

  backToMenuBtn.addEventListener('click', () => {
    if (room) {
      room.close();
      room = null;
    }
    gameContainer.style.display = 'none';
    startMenu.style.display = 'flex';
    board.reset();
    gameMode = 'singleplayer';
  });

  // Initialize menu chat first
  initMenuChat();
}

function startMultiplayerGame(game) {
  // Set up real-time game state updates
  room.onmessage = (event) => {
    const data = event.data;
    if (data.type === 'move') {
      handleOpponentMove(data.from, data.to);
    }
  };

  // Subscribe to game updates
  room.collection('chess_game').filter({ id: game.id }).subscribe((games) => {
    if (games[0]) {
      const currentGame = games[0];
      if (currentGame.status === 'ended') {
        updateStatus(`Game Over! ${currentGame.winner} wins!`);
      }
    }
  });

  board.deserialize(game.current_state);
  initGame();

  // Re-initialize chat for game-specific messages
  initGameChat();
}

function handleOpponentMove(from, to) {
  board.makeMove(from, to);
  updateStatus(`Your turn`);
  board.createBoard(document.getElementById('chessboard'));
}

function initGame() {
  const boardElement = document.getElementById('chessboard');
  const statusElement = document.getElementById('status');
  const resetBtn = document.getElementById('resetBtn');
  const instructionsBtn = document.getElementById('instructionsBtn');
  const instructionsModal = document.getElementById('instructionsModal');
  const closeInstructions = document.getElementById('closeInstructions');

  board.createBoard(boardElement);
  
  boardElement.addEventListener('click', handleSquareClick);
  resetBtn.addEventListener('click', () => {
    board.reset();
    board.createBoard(boardElement);
    updateStatus();
  });

  // Instructions modal handlers
  instructionsBtn.addEventListener('click', () => {
    instructionsModal.style.display = 'block';
  });

  closeInstructions.addEventListener('click', () => {
    instructionsModal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === instructionsModal) {
      instructionsModal.style.display = 'none';
    }
  });

  window.addEventListener('resize', debounce(handleResize, 250));

  updateStatus();
  
  addBoardHoverListeners();
}

function handleSquareClick(event) {
  const square = event.target.closest('.square');
  if (!square) return;

  const position = {
    x: parseInt(square.dataset.x),
    y: parseInt(square.dataset.y)
  };

  if (gameMode === 'singleplayer') {
    handleSinglePlayerMove(position);
  } else {
    handleMultiplayerMove(position);
  }
}

function addBoardHoverListeners() {
  const boardElement = document.getElementById('chessboard');
  
  boardElement.addEventListener('mouseover', (event) => {
    const square = event.target.closest('.square');
    if (!square || selectedSquare) return;

    const position = {
      x: parseInt(square.dataset.x),
      y: parseInt(square.dataset.y)
    };

    const piece = board.getPiece(position);
    if (piece) {
      board.showValidMovesForPiece(position);
    }
  });

  boardElement.addEventListener('mouseout', (event) => {
    const square = event.target.closest('.square');
    if (!square || selectedSquare) return;
    board.clearHighlights();
  });
}

function handleSinglePlayerMove(position) {
  if (board.isHumanTurn()) {
    if (selectedSquare === null) {
      if (board.getPiece(position) && board.getPiece(position).color === 'white') {
        selectedSquare = position;
        board.highlightSquare(position);
        board.showValidMoves(position);
      }
    } else {
      const validMove = board.isValidMove(selectedSquare, position);
      if (validMove) {
        board.makeMove(selectedSquare, position);
        board.clearHighlights();
        selectedSquare = null;
        updateStatus();
        setTimeout(makeAIMove, 500);
      } else {
        board.clearHighlights();
        selectedSquare = null;
      }
    }
  }
}

function handleMultiplayerMove(position) {
  if (board.currentPlayer === playerColor) {
    if (selectedSquare === null) {
      if (board.getPiece(position) && board.getPiece(position).color === playerColor) {
        selectedSquare = position;
        board.highlightSquare(position);
        board.showValidMoves(position);
      }
    } else {
      const validMove = board.isValidMove(selectedSquare, position);
      if (validMove) {
        board.makeMove(selectedSquare, position);
        board.clearHighlights();
        
        // Send move to opponent
        room.send({
          type: 'move',
          from: selectedSquare,
          to: position
        });

        // Update game state in database
        room.collection('chess_game').update(currentGameId, {
          current_state: board.serialize(),
          moves: [...room.collection('chess_game').filter({ id: currentGameId }).getList()[0].moves, { from: selectedSquare, to: position }]
        });

        selectedSquare = null;
        updateStatus("Opponent's turn");
      } else {
        board.clearHighlights();
        selectedSquare = null;
      }
    }
  }
}

function makeAIMove() {
  const statusElement = document.getElementById('status');
  statusElement.textContent = 'AI thinking...';
  
  // Use requestAnimationFrame to prevent UI blocking
  requestAnimationFrame(() => {
    setTimeout(() => {
      const move = ai.calculateBestMove(board);
      if (move) {
        board.makeMove(move.from, move.to);
        updateStatus();
      }
    }, 100);
  });
}

function updateStatus(message = null) {
  const statusElement = document.getElementById('status');
  if (message) {
    statusElement.textContent = message;
    return;
  }

  if (board.isGameOver()) {
    const winner = board.getWinner();
    const reason = board.getGameEndReason();
    
    let statusMessage = '';
    if (winner === 'draw') {
      statusMessage = `Game Over - Draw by ${reason}`;
    } else {
      const winnerText = gameMode === 'singleplayer' ? 
        (winner === 'white' ? 'You win!' : 'AI wins!') :
        `${winner} wins by ${reason}!`;
      statusMessage = `Game Over! ${winnerText}`;
    }
    
    statusElement.textContent = statusMessage;
    statusElement.style.color = 'var(--neon-pink)';

    // If in multiplayer, update the game status in the database
    if (gameMode === 'multiplayer' && room) {
      room.collection('chess_game').update(currentGameId, {
        status: 'ended',
        winner: winner,
        end_reason: reason
      });
    }
  } else {
    let statusText = '';
    
    if (gameMode === 'singleplayer') {
      statusText = board.isHumanTurn() ? 'Your turn' : 'AI thinking...';
    } else {
      statusText = board.currentPlayer === playerColor ? 'Your turn' : "Opponent's turn";
    }

    // Add check status
    if (board.isInCheck(board.currentPlayer)) {
      statusText += ' - CHECK!';
      statusElement.style.color = 'var(--neon-pink)';
    } else {
      statusElement.style.color = 'var(--neon-cyan)';
    }

    statusElement.textContent = statusText;
  }
}

function handleResize() {
  const boardElement = document.getElementById('chessboard');
  board.createBoard(boardElement);
  if (selectedSquare) {
    board.highlightSquare(selectedSquare);
    board.showValidMoves(selectedSquare);
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function initMenuChat() {
  if (!room) {
    room = new WebsimSocket();
  }

  const chatMessages = document.getElementById('startMenuChatMessages');
  const chatInput = document.getElementById('startMenuChatInput');
  const sendButton = document.getElementById('startMenuSendMessage');

  if (!chatMessages || !chatInput || !sendButton) {
    console.error('Menu chat elements not found');
    return;
  }

  // Subscribe to menu chat messages
  room.collection('menu_chat_message').subscribe((messages) => {
    renderMessages(messages, 'startMenuChatMessages');
  });

  // Add event listeners for menu chat
  sendButton.addEventListener('click', () => sendMessage('menu'));
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage('menu');
    }
  });
}

function initGameChat() {
  if (!room) {
    room = new WebsimSocket();
  }

  const chatMessages = document.getElementById('gameChatMessages');
  const chatInput = document.getElementById('gameChatInput');
  const sendButton = document.getElementById('gameSendMessage');

  if (!chatMessages || !chatInput || !sendButton) {
    console.error('Game chat elements not found');
    return;
  }

  // Subscribe to game chat messages
  room.collection('game_chat_message').subscribe((messages) => {
    const gameMessages = messages.filter(m => m.game_id === currentGameId);
    renderMessages(gameMessages, 'gameChatMessages');
  });

  // Add event listeners for game chat
  sendButton.addEventListener('click', () => sendMessage('game'));
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage('game');
    }
  });
}

async function sendMessage(chatType) {
  const inputId = chatType === 'menu' ? 'startMenuChatInput' : 'gameChatInput';
  const chatInput = document.getElementById(inputId);
  const message = chatInput.value.trim();
  
  if (message && room) {
    try {
      await room.collection(`${chatType}_chat_message`).create({
        content: message,
        game_id: chatType === 'game' ? currentGameId : null,
        timestamp: new Date().toISOString(),
        username: isAnonymous ? currentUsername : room.party.client.username
      });
      chatInput.value = '';
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}

function renderMessages(messages, containerId) {
  const chatMessages = document.getElementById(containerId);
  if (!chatMessages) return;

  chatMessages.innerHTML = '';
  
  messages
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach(message => {
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message';
      
      const time = new Date(message.created_at).toLocaleTimeString();
      
      // Check if the message is from the current user
      const isOwnMessage = isAnonymous ? 
        message.username === currentUsername :
        message.username === room.party.client.username;
        
      messageElement.innerHTML = `
        <span class="username">${message.username}</span>
        <span class="time">${time}</span>
        ${isOwnMessage ? '<button class="delete-message">×</button>' : ''}
        <div class="content">${escapeHtml(message.content)}</div>
      `;

      // Add delete functionality if it's the user's own message
      if (isOwnMessage) {
        const deleteBtn = messageElement.querySelector('.delete-message');
        deleteBtn.addEventListener('click', async () => {
          try {
            // The collection and message ID determine which message to delete
            const collection = containerId === 'startMenuChatMessages' ? 
              'menu_chat_message' : 'game_chat_message';
            await room.collection(collection).delete(message.id);
          } catch (error) {
            console.error('Error deleting message:', error);
          }
        });
      }
      
      chatMessages.appendChild(messageElement);
    });
      
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener('load', initMenu);
