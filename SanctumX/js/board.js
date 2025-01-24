export class Board {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = Array(10).fill(null).map(() => Array(10).fill(null));
    this.currentPlayer = 'white';
    this.setupInitialPosition();
  }

  setupInitialPosition() {
    // Setup pawns
    for (let x = 0; x < 10; x++) {
      this.board[1][x] = { type: 'pawn', color: 'black' };
      this.board[8][x] = { type: 'pawn', color: 'white' };
    }

    // Setup other pieces for both colors
    const setupRow = (row, color) => {
      this.board[row][0] = { type: 'rook', color };
      this.board[row][1] = { type: 'knight', color };
      this.board[row][2] = { type: 'bishop', color };
      this.board[row][3] = { type: 'queen', color };
      this.board[row][4] = { type: 'king', color };
      this.board[row][5] = { type: 'chancellor', color }; // New piece (knight + rook)
      this.board[row][6] = { type: 'archbishop', color }; // New piece (knight + bishop)
      this.board[row][7] = { type: 'bishop', color };
      this.board[row][8] = { type: 'knight', color };
      this.board[row][9] = { type: 'rook', color };
    };

    setupRow(0, 'black');
    setupRow(9, 'white');
  }

  createBoard(element) {
    element.innerHTML = '';
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const square = document.createElement('div');
        square.className = `square ${(x + y) % 2 === 0 ? 'light' : 'dark'}`;
        square.dataset.x = x;
        square.dataset.y = y;
        
        const piece = this.board[y][x];
        if (piece) {
          this.renderPiece(square, piece);
        }
        
        element.appendChild(square);
      }
    }
  }

  renderPiece(square, piece) {
    const pieceElement = document.createElement('div');
    pieceElement.className = 'piece';
    pieceElement.textContent = this.getPieceSymbol(piece);
    pieceElement.style.color = piece.color;
    square.appendChild(pieceElement);
  }

  getPieceSymbol(piece) {
    const symbols = {
      king: '♔',
      queen: '♕',
      rook: '♖',
      bishop: '♗',
      knight: '♘',
      pawn: '♙',
      chancellor: '✠',
      archbishop: '☨'
    };
    return symbols[piece.type];
  }

  getPiece(position) {
    return this.board[position.y][position.x];
  }

  isValidMove(from, to) {
    const piece = this.getPiece(from);
    if (!piece || piece.color !== this.currentPlayer) return false;

    // Implement move validation based on piece type
    switch (piece.type) {
      case 'pawn':
        return this.isValidPawnMove(from, to);
      case 'rook':
        return this.isValidRookMove(from, to);
      case 'knight':
        return this.isValidKnightMove(from, to);
      case 'bishop':
        return this.isValidBishopMove(from, to);
      case 'queen':
        return this.isValidQueenMove(from, to);
      case 'king':
        return this.isValidKingMove(from, to);
      case 'chancellor':
        return this.isValidChancellorMove(from, to);
      case 'archbishop':
        return this.isValidArchbishopMove(from, to);
    }
    return false;
  }

  makeMove(from, to) {
    const piece = this.getPiece(from);
    this.board[to.y][to.x] = piece;
    this.board[from.y][from.x] = null;
    this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';
    this.createBoard(document.getElementById('chessboard'));
  }

  highlightSquare(position) {
    const square = document.querySelector(`[data-x="${position.x}"][data-y="${position.y}"]`);
    if (square) square.classList.add('selected');
  }

  clearHighlights() {
    document.querySelectorAll('.square').forEach(square => {
      square.classList.remove('selected', 'valid-move');
    });
  }

  showValidMoves(position) {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.isValidMove(position, {x, y})) {
          const square = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
          if (square) square.classList.add('valid-move');
        }
      }
    }
  }

  isHumanTurn() {
    return this.currentPlayer === 'white';
  }

  isGameOver() {
    // Implement checkmate detection
    return false;
  }

  getWinner() {
    return null;
  }

  serialize() {
    return {
      board: this.board,
      currentPlayer: this.currentPlayer
    };
  }

  deserialize(data) {
    this.board = data.board;
    this.currentPlayer = data.currentPlayer;
  }

  // Implement move validation methods for each piece type
  isValidPawnMove(from, to) {
    const direction = this.currentPlayer === 'white' ? -1 : 1;
    const startRow = this.currentPlayer === 'white' ? 8 : 1;
    
    // Basic one square forward move
    if (from.x === to.x && to.y === from.y + direction && !this.getPiece(to)) {
      return true;
    }
    
    // Initial two square move
    if (from.y === startRow && from.x === to.x && 
        to.y === from.y + 2 * direction && 
        !this.getPiece(to) && 
        !this.getPiece({x: from.x, y: from.y + direction})) {
      return true;
    }
    
    // Capture moves
    if (Math.abs(to.x - from.x) === 1 && to.y === from.y + direction) {
      const targetPiece = this.getPiece(to);
      return targetPiece && targetPiece.color !== this.currentPlayer;
    }
    
    return false;
  }

  isValidRookMove(from, to) {
    if (from.x !== to.x && from.y !== to.y) return false;
    
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let x = from.x + dx;
    let y = from.y + dy;
    
    while (x !== to.x || y !== to.y) {
      if (this.getPiece({x, y})) return false;
      x += dx;
      y += dy;
    }
    
    const targetPiece = this.getPiece(to);
    return !targetPiece || targetPiece.color !== this.currentPlayer;
  }

  isValidKnightMove(from, to) {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    
    if ((dx === 2 && dy === 1) || (dx === 1 && dy === 2)) {
      const targetPiece = this.getPiece(to);
      return !targetPiece || targetPiece.color !== this.currentPlayer;
    }
    return false;
  }

  isValidBishopMove(from, to) {
    if (Math.abs(to.x - from.x) !== Math.abs(to.y - from.y)) return false;
    
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    let x = from.x + dx;
    let y = from.y + dy;
    
    while (x !== to.x && y !== to.y) {
      if (this.getPiece({x, y})) return false;
      x += dx;
      y += dy;
    }
    
    const targetPiece = this.getPiece(to);
    return !targetPiece || targetPiece.color !== this.currentPlayer;
  }

  isValidQueenMove(from, to) {
    return this.isValidRookMove(from, to) || this.isValidBishopMove(from, to);
  }

  isValidKingMove(from, to) {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    
    if (dx <= 1 && dy <= 1) {
      const targetPiece = this.getPiece(to);
      return !targetPiece || targetPiece.color !== this.currentPlayer;
    }
    return false;
  }

  isValidChancellorMove(from, to) {
    return this.isValidRookMove(from, to) || this.isValidKnightMove(from, to);
  }

  isValidArchbishopMove(from, to) {
    return this.isValidBishopMove(from, to) || this.isValidKnightMove(from, to);
  }
}
