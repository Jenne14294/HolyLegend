import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import app from './app.js';
import { sequelize } from './models/index.js'; // 需確保 models 資料夾存在

// 讀取環境變數
dotenv.config();

const port = process.env.PORT || 3000;

// 1. 建立 HTTP Server
const server = http.createServer(app);

// 2. 建立 Socket.io Server (綁定在 HTTP Server 上)
const io = new Server(server, {
  cors: {
    origin: "*", // 允許所有來源連線 (開發方便)
    methods: ["GET", "POST"]
  }
});

// 將 io 掛載到 app，讓 Route 也可以廣播訊息 (req.app.get('io'))
app.set('io', io);

// 3. Socket.io 事件監聽 (遊戲邏輯寫在這)
io.on('connection', (socket) => {
  console.log(`[Socket] 玩家連線 ID: ${socket.id}`);

  // 範例：監聽玩家加入
  socket.on('join_game', (data) => {
    console.log('玩家加入:', data);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] 玩家斷線 ID: ${socket.id}`);
  });
});

// 4. 啟動流程：連線資料庫 -> 同步 Table -> 啟動 Server
async function startServer() {
  try {
    // 測試資料庫連線
    await sequelize.authenticate();
    console.log('資料庫連線成功！');

    // 同步資料表 (如果 Table 不存在會自動建立)
    await sequelize.sync(); 
    console.log('資料表同步完成！');

    // 啟動 Port 監聽
    server.listen(port, () => {
      console.log(`伺服器啟動於: http://localhost:${port}`);
    });

  } catch (error) {
    console.error('無法啟動伺服器:', error);
  }
}

startServer();