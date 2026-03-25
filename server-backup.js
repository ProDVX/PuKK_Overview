const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- PATH CONFIGURATION ---
const viewsPath = path.join(__dirname, "../views");
const publicPath = path.join(__dirname, "../public");

// --- VIEW ENGINE & STATIC FILES ---
app.set("view engine", "ejs");
app.set("views", viewsPath);
app.use(express.static(publicPath));

app.use(express.json({
  verify: (req, res, buf, encoding) => {
    const rawString = buf.toString(encoding || 'utf8');
    
    console.log("--- RAW INCOMING BODY ---");
    console.log(rawString);
    console.log("-------------------------");

    console.log("HEX representation (to find hidden chars):");
    console.log(buf.toString('hex').match(/.{1,2}/g).join(' '));
  }
}));

let statuses = [
  { //* Single Press -> Available (Green)
    action: "short_press",
    status: "available",
    ledStatus: "on",
    jsonBody: {
      led_values: {
        color: {
          brightness: 100,
          red: 0,
          green: 255,
          blue: 0
        },
        duration_ms: 0
      },
    },
  },
  { //* Double Press -> Occupied (Red)
    action: "double_press",
    status: "occupied",
    ledStatus: "on",
    jsonBody: {
      led_values: {
        color: {
          brightness: 100,
          red: 255,
          green: 0,
          blue: 0
        },
        duration_ms: 0
      },
    },
  },
  { //* Long Press 5s -> Offline (Off)
    action: "long_press_5s",
    status: "offline",
    ledStatus: "on",
    jsonBody: {
      led_values: {
        color: {
          brightness: 0,
          red: 0,
          green: 0,
          blue: 0
        },
        duration_ms: 0
      },
    },
  },
  { //* Long Press 3s -> Busy (Rainbow)
    action: "long_press_3s",
    status: "busy",
    ledStatus: "rainbow",
    jsonBody: {
      led_values: {
        speed_ms: 10,
        duration_ms: 0,
        counter_clockwise: false
      },
    },
  },
  { //* Auto-reset to Available (Green to Orange to Red)
    status: "ending",
    ledStatus: 'clock',
    jsonBody: {
      led_values: {
        initial_color: {
          brightness: 100,
          red: 255,
          green: 0,
          blue: 0,
        },
        end_color: {
          brightness: 100,
          red: 0,
          green: 255,
          blue: 0,
        },
        intermediate_color: {
          brightness: 100,
          red: 255,
          green: 165,
          blue: 0,
        },
        rotation_time_s: 6,
        counter_clockwise: false,
      },
    },
  },
  { //* Occupied on NFC
    action: "nfc",
    status: "occupied",
    jsonBody: {
      led_values: {
        color: {
          brightness: 100,
          red: 255,
          green: 0,
          blue: 0
        },
        duration_ms: 0
      },
    },
  }
];

// --- DATA ---
let units = [];
let nextUnitId = 1;

// --- ROUTES ---
app.get("/dashboard", (req, res) => {
  res.render("index", { units: JSON.stringify(units) });
});

app.post("/rename", (req, res) => {
  const { mac, newName } = req.body;
  const unit = units.find((u) => u.mac === mac);

  if (unit && newName) {
    unit.name = newName;
    // Broadcast the name change to all dashboards
    io.emit("updateUnits", units);
    return res.status(200).send("Name updated");
  }
  res.status(404).send("Unit not found");
});

app.delete("/removePukk", (req, res) => {
  const { mac } = req.body;
  const unitIndex = units.findIndex((u) => u.mac === mac);
  if (unitIndex !== -1) {
    units.splice(unitIndex, 1);
    // Broadcast the removal to all dashboards
    io.emit("updateUnits", units);
    return res.status(200).send("Pukk removed");
  }
  res.status(404).send("Unit not found");
});

app.post("/setStatus", (req, res) => {
  const { mac, newStatus } = req.body;
  const unit = units.find((u) => u.mac === mac);
  if (unit && newStatus) {
    unit.status = newStatus;
	unit.lastSeen = new Date();
    // Broadcast the status change to all dashboards
    io.emit("updateUnits", units);

    let statusEntry = statuses.find((s) => s.status === newStatus);
    if (statusEntry) {
      sendLedCommand(unit.ip, statusEntry.jsonBody);
    }

    return res.status(200).send("Status updated");
  }
  res.status(404).send("Unit not found");
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pukk Webhook
app.post("/", async (req, res) => {
  const action = req.query.action;
  const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
  const pukkIp = req.ip.replace("::ffff:", "");
  console.log(`Received request with action=${action} from ip:${pukkIp}`);
  
  if (!mac || !action) return res.status(400).send("Missing MAC/Action");

  let unit = units.find((u) => u.mac === mac);

  if (!unit) {
    unit = {
      id: nextUnitId++,
      name: `Pukk ${units.length + 1}`,
      status: "available",
      mac: mac,
      ip: pukkIp,
      lastSeen: new Date(),
    };
    units.push(unit);
  } else {
    unit.ip = pukkIp;
    unit.lastSeen = new Date();
  }

  if(req.body && Object.keys(req.body).length > 0) {
    console.log(req.body);
  }

  if (action==="nfc") {
    if (req.body.data) {
      let nfcData = req.body.data
      io.emit('nfcData', nfcData);
    }
  }

  // Server decides what to do on an action
  let statusEntry = statuses.find((s) => s.action === action);
  switch(statusEntry.status) {
    case "available": 
      unit.status = statusEntry.status
      sendLedCommand(unit.ip, null, statusEntry.jsonBody);
      break;
    case "occupied":
      unit.status = statusEntry.status
      sendLedCommand(unit.ip, null, statusEntry.jsonBody);
      break;
    case "offline":
      unit.status = statusEntry.status
      sendLedCommand(unit.ip, "off", statusEntry.jsonBody);
      break;
    case "busy":
      unit.status = statusEntry.status
      sendLedCommand(unit.ip, "rainbow", statusEntry.jsonBody);
      break;
    case "ending":
      unit.status = statusEntry.status
      sendLedCommand(unit.ip, "clock", statusEntry.jsonBody);
      break;
    default:
      console.log("No Status found")
      return;
  }

  res.status(200).send("OK");  

  // Notify all dashboards to update
  io.emit("updateUnits", units);
});

setInterval(() => {
  const now = new Date();
  const TIMEOUT_MS = 8000; // 10 seconds
  units.forEach((unit) => {
    const timeElapsed = now - new Date(unit.lastSeen);
    if (unit.status === "occupied" && timeElapsed > TIMEOUT_MS) {
      console.log(`Auto resetting ${unit.name} due to inactivity.`);

      const endingStatus = statuses.find((s) => s.status === "ending");
      unit.status = "ending";
      unit.lastSeen = new Date();

      sendLedCommand(unit.ip, "clock", endingStatus.jsonBody);

      io.emit("updateUnits", units);
    }
  });
}, 1000);

setInterval(() => {
  const now = new Date();
  const TIMEOUT_MS = 8000; // 24 seconds
  units.forEach((unit) => {
    const timeElapsed = now - new Date(unit.lastSeen);
    if (unit.status === "ending" && timeElapsed > TIMEOUT_MS) {
      console.log(`${unit.name} is reset to available.`);

      const availableStatus = statuses.find((s) => s.status === "available");
      unit.status = "available";

      sendLedCommand(unit.ip, availableStatus.jsonBody);

      io.emit("updateUnits", units);
    }
  });
}, 1000);

app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err.stack);
  res.status(500).send("Internal Server Error");
});

async function safeFetch(url, payload, description) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Set a short timeout so the server doesn't hang forever
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.error(
        `[${description}] Device returned error: ${response.status}`
      );
    }
  } catch (err) {
    console.error(`[${description}] Failed to reach ${url}: ${err.message}`);
    // TODO: Optionally set unit.status = 'offline' here if connection fails
  }
}

async function sendLedCommand(ip, type, payload) {
  let url = `http://${ip}/api/setLeds`;
  if(type) url = url + `/${type}`;
  console.log(`Sending Led command: ${url}`);
  await safeFetch(url, payload, "LED_CMD");
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const config of iface) {
      if (config.family === "IPv4" && !config.internal) {
        return config.address;
      }
    }
  }
  return "localhost";
}

const PORT = 3001;

server.listen(PORT, "0.0.0.0", () => {
  console.log("-----------------------------------------");
  console.log(`Server running at http://${wifiIp}:${PORT}/dashboard`);
  console.log("-----------------------------------------");
});
