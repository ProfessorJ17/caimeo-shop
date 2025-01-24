import { Board } from './board.js';

export class AI {
  constructor() {
    this.maxDepth = 2; 
    this.pieceValues = {
      pawn: 100,
      knight: 320,
      bishop: 330,
      rook: 500,
      queen: 900,
      king: 20000,
      chancellor: 800,
      archbishop: 700
    };
  }

  calculateBestMove(board) {
    let bestMove = null;
    let depth = 1;
    
    try {
      while (depth <= this.maxDepth) {
        const result = this.findBestMoveAtDepth(board, depth);
        bestMove = result;
        depth++;
      }
    } catch (e) {
      console.log("Depth limit reached:", depth - 1);
    }

    return bestMove || this.findFallbackMove(board);
  }

  findBestMoveAtDepth(board, depth) {
    let bestMove = null;
    let bestScore = -Infinity;
    const possibleMoves = this.getSmartMovesList(board, 'black');

    for (const move of possibleMoves) {
      const boardCopy = this.lightweightBoardCopy(board);
      this.makeMove(boardCopy, move);
      
      const score = this.minimax(boardCopy, depth - 1, false, -Infinity, Infinity);
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  findFallbackMove(board) {
    const moves = this.getSmartMovesList(board, 'black');
    return moves.length > 0 ? moves[0] : null;
  }

  getSmartMovesList(board, color) {
    const moves = [];
    const capturingMoves = [];
    
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const piece = board.board[y][x];
        if (piece && piece.color === color) {
          const possibleDestinations = this.getPossibleDestinations(board, {x, y});
          
          for (const dest of possibleDestinations) {
            const targetPiece = board.board[dest.y][dest.x];
            const move = { from: {x, y}, to: dest };
            
            if (targetPiece) {
              capturingMoves.push(move);
            } else {
              moves.push(move);
            }
          }
        }
      }
    }
    
    return [...capturingMoves, ...moves];
  }

  getPossibleDestinations(board, from) {
    const destinations = [];
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (board.isValidMove(from, {x, y})) {
          destinations.push({x, y});
        }
      }
    }
    return destinations;
  }

  minimax(board, depth, isMaximizing, alpha, beta) {
    if (depth === 0) {
      return this.evaluatePosition(board);
    }

    const moves = this.getSmartMovesList(board, isMaximizing ? 'black' : 'white');
    
    if (isMaximizing) {
      let maxScore = -Infinity;
      for (const move of moves) {
        const boardCopy = this.lightweightBoardCopy(board);
        this.makeMove(boardCopy, move);
        const score = this.minimax(boardCopy, depth - 1, false, alpha, beta);
        maxScore = Math.max(maxScore, score);
        alpha = Math.max(alpha, score);
        if (beta <= alpha) break;
      }
      return maxScore;
    } else {
      let minScore = Infinity;
      for (const move of moves) {
        const boardCopy = this.lightweightBoardCopy(board);
        this.makeMove(boardCopy, move);
        const score = this.minimax(boardCopy, depth - 1, true, alpha, beta);
        minScore = Math.min(minScore, score);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return minScore;
    }
  }

  evaluatePosition(board) {
    let score = 0;
    
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const piece = board.board[y][x];
        if (piece) {
          const positionBonus = this.getPositionBonus(piece.type, x, y);
          const value = this.pieceValues[piece.type] + positionBonus;
          score += piece.color === 'black' ? value : -value;
        }
      }
    }
    
    return score;
  }

  getPositionBonus(pieceType, x, y) {
    const centerBonus = (x >= 3 && x <= 6 && y >= 3 && y <= 6) ? 10 : 0;
    
    const pawnBonus = pieceType === 'pawn' ? y : 0;
    
    return centerBonus + pawnBonus;
  }

  lightweightBoardCopy(board) {
    const newBoard = new Board();
    newBoard.board = board.board.map(row => row.map(piece => 
      piece ? { type: piece.type, color: piece.color } : null
    ));
    newBoard.currentPlayer = board.currentPlayer;
    return newBoard;
  }

  makeMove(board, move) {
    const piece = board.board[move.from.y][move.from.x];
    board.board[move.to.y][move.to.x] = piece;
    board.board[move.from.y][move.from.x] = null;
    board.currentPlayer = board.currentPlayer === 'white' ? 'black' : 'white';
  }
}
