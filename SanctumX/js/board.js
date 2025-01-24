export class Board {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = Array(10).fill(null).map(() => Array(10).fill(null));
    this.currentPlayer = 'white';
    this.moveHistory = [];
    this.halfMoveClock = 0; 
    this.positionHistory = new Map(); 
    this.gameStatus = {
      isOver: false,
      result: null,
      reason: null
    };
    this.setupInitialPosition();
  }

  setupInitialPosition() {
    for (let x = 0; x < 10; x++) {
      this.board[1][x] = { type: 'pawn', color: 'black' };
      this.board[8][x] = { type: 'pawn', color: 'white' };
    }

    const setupRow = (row, color) => {
      this.board[row][0] = { type: 'rook', color };
      this.board[row][1] = { type: 'knight', color };
      this.board[row][2] = { type: 'bishop', color };
      this.board[row][3] = { type: 'queen', color };
      this.board[row][4] = { type: 'king', color };
      this.board[row][5] = { type: 'chancellor', color }; 
      this.board[row][6] = { type: 'archbishop', color }; 
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

    // Check if move is valid according to piece rules
    let validPieceMove = false;
    switch (piece.type) {
      case 'pawn':
        validPieceMove = this.isValidPawnMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'rook':
        validPieceMove = this.isValidRookMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'knight':
        validPieceMove = this.isValidKnightMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'bishop':
        validPieceMove = this.isValidBishopMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'queen':
        validPieceMove = this.isValidQueenMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'king':
        validPieceMove = this.isValidKingMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'chancellor':
        validPieceMove = this.isValidChancellorMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
      case 'archbishop':
        validPieceMove = this.isValidArchbishopMove({x: from.x, y: from.y}, {x: to.x, y: to.y});
        break;
    }

    if (!validPieceMove) return false;

    // Make temporary move and check if it would leave king in check
    const tempBoard = this.cloneBoard();
    tempBoard.board[to.y][to.x] = piece;
    tempBoard.board[from.y][from.x] = null;

    // If move would leave or keep own king in check, it's invalid
    if (tempBoard.isInCheck(this.currentPlayer)) {
      return false;
    }

    return true;
  }

  isInCheck(color) {
    // Find king position
    let kingPos = null;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const piece = this.board[y][x];
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = {x, y};
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return false; // Should never happen in a valid game

    // Check if any opponent piece can capture the king
    const opponentColor = color === 'white' ? 'black' : 'white';
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const piece = this.board[y][x];
        if (piece && piece.color === opponentColor) {
          // Save current game state
          const savedCurrentPlayer = this.currentPlayer;
          this.currentPlayer = opponentColor;

          // Check if piece can attack king position using piece movement rules only
          let canAttackKing = false;
          switch (piece.type) {
            case 'pawn':
              canAttackKing = this.isValidPawnMove({x, y}, kingPos);
              break;
            case 'rook':
              canAttackKing = this.isValidRookMove({x, y}, kingPos);
              break;
            case 'knight':
              canAttackKing = this.isValidKnightMove({x, y}, kingPos);
              break;
            case 'bishop':
              canAttackKing = this.isValidBishopMove({x, y}, kingPos);
              break;
            case 'queen':
              canAttackKing = this.isValidQueenMove({x, y}, kingPos);
              break;
            case 'king':
              canAttackKing = this.isValidKingMove({x, y}, kingPos);
              break;
            case 'chancellor':
              canAttackKing = this.isValidChancellorMove({x, y}, kingPos);
              break;
            case 'archbishop':
              canAttackKing = this.isValidArchbishopMove({x, y}, kingPos);
              break;
          }

          // Restore game state
          this.currentPlayer = savedCurrentPlayer;

          if (canAttackKing) {
            return true;
          }
        }
      }
    }
    return false;
  }

  hasLegalMoves(color) {
    // Check every possible move for every piece
    for (let fromY = 0; fromY < 10; fromY++) {
      for (let fromX = 0; fromX < 10; fromX++) {
        const piece = this.board[fromY][fromX];
        if (piece && piece.color === color) {
          // Try every possible destination
          for (let toY = 0; toY < 10; toY++) {
            for (let toX = 0; toX < 10; toX++) {
              // Save current game state
              const savedCurrentPlayer = this.currentPlayer;
              this.currentPlayer = color;

              // Check if move is legal (includes checking if it prevents/escapes check)
              if (this.isValidMove({x: fromX, y: fromY}, {x: toX, y: toY})) {
                // Restore game state
                this.currentPlayer = savedCurrentPlayer;
                return true;
              }

              // Restore game state
              this.currentPlayer = savedCurrentPlayer;
            }
          }
        }
      }
    }
    return false;
  }

  makeMove(from, to) {
    const piece = this.getPiece(from);
    const capturedPiece = this.getPiece(to);
    
    this.moveHistory.push({
      from,
      to,
      piece,
      captured: capturedPiece,
      halfMoveClock: this.halfMoveClock
    });

    // Reset halfmove clock if pawn moved or piece captured
    if (piece.type === 'pawn' || capturedPiece) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }

    // Make the move
    this.board[to.y][to.x] = piece;
    this.board[from.y][from.x] = null;

    // Record position for three-fold repetition
    const positionKey = this.getPositionKey();
    this.positionHistory.set(positionKey, (this.positionHistory.get(positionKey) || 0) + 1);

    // Switch players
    this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';

    // Check game ending conditions (checkmate, stalemate, etc.)
    this.checkGameEndingConditions();

    // Redraw board
    this.createBoard(document.getElementById('chessboard'));
  }

  getPositionKey() {
    return this.board.map(row => 
      row.map(piece => 
        piece ? `${piece.type}${piece.color}` : 'empty'
      ).join(',')
    ).join('|') + this.currentPlayer;
  }

  checkGameEndingConditions() {
    const inCheck = this.isInCheck(this.currentPlayer);
    const hasLegalMoves = this.hasLegalMoves(this.currentPlayer);

    // First check checkmate/stalemate
    if (inCheck && !hasLegalMoves) {
      this.gameStatus = {
        isOver: true,
        result: this.currentPlayer === 'white' ? 'black' : 'white',
        reason: 'checkmate'
      };
      return;
    }

    if (!inCheck && !hasLegalMoves) {
      this.gameStatus = {
        isOver: true,
        result: 'draw',
        reason: 'stalemate'
      };
      return;
    }

    // Check for draw by insufficient material
    if (this.hasInsufficientMaterial()) {
      this.gameStatus = {
        isOver: true,
        result: 'draw',
        reason: 'insufficient material'
      };
      return;
    }

    // Check three-fold repetition
    const currentPosition = this.getPositionKey();
    if (this.positionHistory.get(currentPosition) >= 3) {
      this.gameStatus = {
        isOver: true,
        result: 'draw',
        reason: 'threefold repetition'
      };
      return;
    }

    // Check fifty-move rule
    if (this.halfMoveClock >= 100) {
      this.gameStatus = {
        isOver: true,
        result: 'draw',
        reason: 'fifty-move rule'
      };
      return;
    }
  }

  hasInsufficientMaterial() {
    const pieces = this.getAllPieces();
    
    // King vs King
    if (pieces.length === 2) {
      return true;
    }

    // King and Bishop/Knight vs King
    if (pieces.length === 3) {
      for (const player of ['white', 'black']) {
        const playerPieces = pieces.filter(p => p.piece.color === player);
        if (playerPieces.length === 2) {
          const nonKing = playerPieces.find(p => p.piece.type !== 'king');
          if (nonKing && (nonKing.piece.type === 'bishop' || nonKing.piece.type === 'knight')) {
            return true;
          }
        }
      }
    }

    // King and Bishop vs King and Bishop (same color)
    if (pieces.length === 4) {
      const bishops = pieces.filter(p => p.piece.type === 'bishop');
      if (bishops.length === 2) {
        const firstBishopSquareColor = (bishops[0].x + bishops[0].y) % 2;
        const secondBishopSquareColor = (bishops[1].x + bishops[1].y) % 2;
        if (firstBishopSquareColor === secondBishopSquareColor) {
          return true;
        }
      }
    }

    // King and Archbishop vs King and Archbishop (same color bishops)
    if (pieces.length === 4) {
      const archbishops = pieces.filter(p => p.piece.type === 'archbishop');
      if (archbishops.length === 2) {
        const firstArchbishopSquareColor = (archbishops[0].x + archbishops[0].y) % 2;
        const secondArchbishopSquareColor = (archbishops[1].x + archbishops[1].y) % 2;
        if (firstArchbishopSquareColor === secondArchbishopSquareColor) {
          return true;
        }
      }
    }

    return false;
  }

  getAllPieces() {
    const pieces = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.board[y][x]) {
          pieces.push({
            piece: this.board[y][x],
            x: x,
            y: y
          });
        }
      }
    }
    return pieces;
  }

  isGameOver() {
    return this.gameStatus.isOver;
  }

  getWinner() {
    return this.gameStatus.result;
  }

  getGameEndReason() {
    return this.gameStatus.reason;
  }

  cloneBoard() {
    const newBoard = new Board();
    newBoard.board = this.board.map(row => [...row]);
    newBoard.currentPlayer = this.currentPlayer;
    return newBoard;
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

  showValidMovesForPiece(position) {
    const piece = this.getPiece(position);
    if (!piece) return;
    
    const savedPlayer = this.currentPlayer;
    this.currentPlayer = piece.color;

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (this.isValidMove(position, {x, y})) {
          const square = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
          if (square) square.classList.add('valid-move');
        }
      }
    }

    this.currentPlayer = savedPlayer;
  }

  isHumanTurn() {
    return this.currentPlayer === 'white';
  }

  isValidPawnMove(from, to) {
    const direction = this.currentPlayer === 'white' ? -1 : 1;
    const startRow = this.currentPlayer === 'white' ? 8 : 1;
    
    if (from.x === to.x && to.y === from.y + direction && !this.getPiece(to)) {
      return true;
    }
    
    if (from.y === startRow && from.x === to.x && 
        to.y === from.y + 2 * direction && 
        !this.getPiece(to) && 
        !this.getPiece({x: from.x, y: from.y + direction})) {
      return true;
    }
    
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
}
