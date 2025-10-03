const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;
const http = require('http');

// Aggressive keep-alive for Replit Free
const keepAlive = () => {
    setInterval(() => {
        console.log(`[${new Date().toISOString()}] ⚡ Keep-alive - Process ID: ${process.pid}`);
        
        // Make HTTP request to self to prevent sleeping
        const options = {
            hostname: 'localhost',
            port: process.env.PORT || 8000,
            path: '/ping',
            method: 'GET',
            timeout: 5000
        };
        
        const req = http.request(options, (res) => {
            // Self-ping successful
        });
        
        req.on('error', (err) => {
            // Ignore self-ping errors
        });
        
        req.end();
    }, 25000); // Every 25 seconds
};

// Process signal handlers for Replit Free
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, keeping process alive...');
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, keeping process alive...');
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Don't exit, keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit, keep running
});

// Load environment variables for cloud deployment
try {
  require('dotenv').config();
} catch (err) {
  console.log('💡 dotenv not found, using system environment variables');
}

const config = require('./settings.json');
const express = require('express');

// Override config with environment variables for cloud deployment
if (process.env.MINECRAFT_HOST) {
  config.server.ip = process.env.MINECRAFT_HOST;
}
if (process.env.MINECRAFT_PORT) {
  config.server.port = parseInt(process.env.MINECRAFT_PORT);
}
if (process.env.BOT_USERNAME) {
  config['bot-account'].username = process.env.BOT_USERNAME;
}
if (process.env.BOT_AUTH_TYPE) {
  config['bot-account'].type = process.env.BOT_AUTH_TYPE;
}

const app = express();

app.get('/', (req, res) => {
  res.send('🎮 Minecraft AFK Bot is running!');
});

// UptimeRobot keep-alive endpoints
app.get('/ping', (req, res) => {
  res.send('pong - Bot is alive!');
});

app.get('/health', (req, res) => {
  const status = {
    status: 'online',
    bot_connected: isConnected,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    server: config.server.ip + ':' + config.server.port,
    reconnect_attempts: reconnectAttempts
  };
  res.json(status);
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server started on port ${PORT}`);
  if (process.env.REPL_SLUG) {
    console.log(`🔗 Replit URL: https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  }
  
  // Start aggressive keep-alive system for Replit Free
  console.log('🚀 Starting Replit Free keep-alive system...');
  keepAlive();
});

// Additional keep-alive mechanism for UptimeRobot
setInterval(() => {
  console.log('💓 UptimeRobot keep-alive ping');
}, 300000); // Ping every 5 minutes

let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let isConnected = false;
let reconnectTimeout = null;

function createBot() {
   console.log(`[INFO] Creating bot... (Attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
   
   const bot = mineflayer.createBot({
      username: config['bot-account']['username'],
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
      checkTimeoutInterval: 60 * 60 * 1000, // 1 hour timeout instead of 30 seconds
      connectTimeout: 30000, // 30 second connection timeout
      hideErrors: false, // Show all errors for debugging
   });
   
   console.log(`[DEBUG] Attempting to connect to ${config.server.ip}:${config.server.port} as '${config['bot-account']['username']}'`);

   bot.loadPlugin(pathfinder);
   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   bot.settings.colorsEnabled = false;

   let pendingPromise = Promise.resolve();
   let afkInterval = null;

   function sendRegister(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[Auth] Sent /register command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            // Check for various possible responses
            if (message.includes('successfully registered')) {
               console.log('[INFO] Registration confirmed.');
               resolve();
            } else if (message.includes('already registered')) {
               console.log('[INFO] Bot was already registered.');
               resolve(); // Resolve if already registered
            } else if (message.includes('Invalid command')) {
               reject(`Registration failed: Invalid command. Message: "${message}"`);
            } else {
               reject(`Registration failed: unexpected message "${message}".`);
            }
         });
      });
   }

   function sendLogin(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/login ${password}`);
         console.log(`[Auth] Sent /login command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`); // Log all chat messages

            if (message.includes('successfully logged in')) {
               console.log('[INFO] Login successful.');
               resolve();
            } else if (message.includes('Invalid password')) {
               reject(`Login failed: Invalid password. Message: "${message}"`);
            } else if (message.includes('not registered')) {
               reject(`Login failed: Not registered. Message: "${message}"`);
            } else {
               reject(`Login failed: unexpected message "${message}".`);
            }
         });
      });
   }

   bot.on('spawn', () => {
      isConnected = true;
      console.log('\x1b[33m[AfkBot] Bot fully spawned and ready', '\x1b[0m');
      
      // Add keep alive mechanism
      const keepAliveInterval = setInterval(() => {
         if (bot.player && bot.player.entity) {
            // Send a subtle keep-alive action (looking around slightly)
            const currentYaw = bot.entity.yaw;
            bot.look(currentYaw + 0.1, bot.entity.pitch);
         }
      }, 30000); // Every 30 seconds
      
      // Store interval for cleanup
      bot.keepAliveInterval = keepAliveInterval;

      if (config.utils['auto-auth'].enabled) {
         console.log('[INFO] Started auto-auth module');

         const password = config.utils['auto-auth'].password;

         pendingPromise = pendingPromise
            .then(() => sendRegister(password))
            .then(() => sendLogin(password))
            .catch(error => console.error('[ERROR]', error));
      }

      if (config.utils['chat-messages'].enabled) {
         console.log('[INFO] Started chat-messages module');
         const messages = config.utils['chat-messages']['messages'];

         if (config.utils['chat-messages'].repeat) {
            const delay = config.utils['chat-messages']['repeat-delay'];
            let i = 0;

            let msg_timer = setInterval(() => {
               bot.chat(`${messages[i]}`);

               if (i + 1 === messages.length) {
                  i = 0;
               } else {
                  i++;
               }
            }, delay * 1000);
         } else {
            messages.forEach((msg) => {
               bot.chat(msg);
            });
         }
      }

      const pos = config.position;

      if (config.position.enabled) {
         console.log(
            `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
         );
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      if (config.utils['anti-afk'].enabled && !afkInterval) {
         console.log('[INFO] Anti-AFK enabled - bot will move around');
         
         afkInterval = setInterval(() => {
            if (!bot.entity) return;
            
            const actions = [
               () => {
                  bot.setControlState('forward', true);
                  setTimeout(() => bot.setControlState('forward', false), 500);
               },
               () => {
                  bot.setControlState('back', true);
                  setTimeout(() => bot.setControlState('back', false), 500);
               },
               () => {
                  bot.setControlState('left', true);
                  setTimeout(() => bot.setControlState('left', false), 500);
               },
               () => {
                  bot.setControlState('right', true);
                  setTimeout(() => bot.setControlState('right', false), 500);
               },
               () => {
                  bot.setControlState('jump', true);
                  setTimeout(() => bot.setControlState('jump', false), 100);
               },
               () => {
                  const yaw = Math.random() * Math.PI * 2;
                  bot.look(yaw, 0);
               }
            ];
            
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            randomAction();
            
         }, 3000);
      }
   });

   bot.on('goal_reached', () => {
      console.log(
         `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
      );
   });

   bot.on('death', () => {
      console.log(
         `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
         '\x1b[0m'
      );
   });

   if (config.utils['auto-reconnect']) {
      bot.on('end', (reason) => {
         // Mark as disconnected
         isConnected = false;
         
         // Clean up all intervals
         if (afkInterval) {
            clearInterval(afkInterval);
            afkInterval = null;
         }
         if (bot.keepAliveInterval) {
            clearInterval(bot.keepAliveInterval);
            bot.keepAliveInterval = null;
         }
         
         console.log(`[INFO] Bot disconnected. Reason: ${reason || 'Unknown'}`);
         
         // Only reconnect if we're not already connected and haven't exceeded attempts
         if (!isConnected && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const baseDelay = config.utils['auto-reconnect-delay'] || 5000;
            // Exponential backoff: increase delay with each attempt
            const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttempts - 1), 60000);
            console.log(`[INFO] Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            
            reconnectTimeout = setTimeout(() => {
               if (!isConnected) { // Double-check we're still disconnected
                  createBot();
               } else {
                  console.log('[INFO] Bot is already connected, cancelling reconnection.');
               }
            }, delay);
         } else if (isConnected) {
            console.log('[INFO] Bot is already connected, no need to reconnect.');
         } else {
            console.log('[ERROR] Maximum reconnection attempts reached. Stopping bot.');
         }
      });
   }

   bot.on('kicked', (reason) => {
      isConnected = false; // Mark as disconnected
      console.log(
         '\x1b[33m',
         `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
         '\x1b[0m'
      );
      // Clean up all intervals when kicked
      if (afkInterval) {
         clearInterval(afkInterval);
         afkInterval = null;
      }
      if (bot.keepAliveInterval) {
         clearInterval(bot.keepAliveInterval);
         bot.keepAliveInterval = null;
      }
   });

   bot.on('error', (err) => {
      isConnected = false; // Mark as disconnected on error
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m');
      // Clean up all intervals on error
      if (afkInterval) {
         clearInterval(afkInterval);
         afkInterval = null;
      }
      if (bot.keepAliveInterval) {
         clearInterval(bot.keepAliveInterval);
         bot.keepAliveInterval = null;
      }
   });
   
   // Reset reconnect attempts on successful connection
   bot.on('login', () => {
      reconnectAttempts = 0;
      isConnected = true;
      console.log('[INFO] Successfully connected to server!');
      
      // Clear any pending reconnection attempts
      if (reconnectTimeout) {
         clearTimeout(reconnectTimeout);
         reconnectTimeout = null;
      }
   });
   

   
   // Add connection monitoring
   bot.on('connect', () => {
      console.log('[INFO] Connecting to server...');
   });
   
   // Monitor health and connection status
   setInterval(() => {
      if (bot.player && bot.player.ping !== undefined) {
         console.log(`[HEALTH] Ping: ${bot.player.ping}ms, Players online: ${Object.keys(bot.players).length}, Connected: ${isConnected}`);
      }
   }, 300000); // Log health every 5 minutes
   
   // Return the bot instance for external monitoring
   return bot;
}

createBot();
