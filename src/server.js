const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// --- PATH CONFIGURATION ---
const viewsPath = path.join(__dirname, "../views");
const publicPath = path.join(__dirname, "../public");

// --- VIEW ENGINE & STATIC FILES ---
app.set("view engine", "ejs");
app.set("views", viewsPath);
app.use(express.static(publicPath));

let statuses = [
  { //* Single Press -> Available (Green)
    action: "short_press",
    status: "available",
    jsonBody: {
      ledValues: {
        type: 2,
        red: 0,
        green: 255,
        blue: 0,
        wait_ms: 0,
        speed_ms: 0,
        brightness: 100,
      },
    },
  },
  { //* Double Press -> Occupied (Red)
    action: "double_press",
    status: "occupied",
    jsonBody: {
      ledValues: {
        type: 2,
        red: 255,
        green: 0,
        blue: 0,
        wait_ms: 0,
        speed_ms: 0,
        brightness: 100,
      },
    },
  },
  { //* Long Press 5s -> Offline (Off)
    action: "long_press_5s",
    status: "offline",
    jsonBody: {
      ledValues: {
        type: 0,
        red: 0,
        green: 0,
        blue: 0,
        wait_ms: 0,
        speed_ms: 0,
        brightness: 100,
      },
    },
  },
  { //* Long Press 3s -> Busy (Rainbow)
    action: "long_press_3s",
    status: "busy",
    jsonBody: {
      ledValues: {
        type: 4,
        red: 0,
        green: 0,
        blue: 0,
        wait_ms: 0,
        speed_ms: 0,
        brightness: 100,
      },
    },
  },
  { //* Auto-reset to Available (Green to Orange to Red)
    status: "ending",
    jsonBody: {
      ledValues: {
        initial: {
          l: 100,
          r: 255,
          g: 0,
          b: 0,
        },
        end: {
          l: 100,
          r: 0,
          g: 255,
          b: 0,
        },
        intermediary: {
          l: 100,
          r: 255,
          g: 165,
          b: 0,
        },
        rotationTime_s: 6,
        counterClockwise: false,
      },
    },
  },
];

// --- DATA ---
// let units = [];
let nextUnitId = 1;

units = [
	{
		id: 1,
		name: "Pukk 1",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 2,
		name: "Pukk 2",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 3,
		name: "Pukk 3",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 4,
		name: "Pukk 4",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 5,
		name: "Pukk 5",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 6,
		name: "Pukk 6",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 7,
		name: "Pukk 7",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 8,
		name: "Pukk 8",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 9,
		name: "Pukk 9",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  },
	  {
		id: 10,
		name: "Pukk 10",
		status: "available",
		mac: "00:1A:2B:3C:4D:5E",
		ip: "192.168.1.101",
		lastSeen: new Date(),
	  }  
]

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

// Pukk Webhook
app.post("/", (req, res) => {
  const action = req.query.action;
  const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
  const pukkIp = req.ip.replace("::ffff:", "");

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

  // Logic: Server decides status and LED color based on action
  let ledPayload = { command: "setLeds", body: {} }; // Default Green

  let statusEntry = statuses.find((s) => s.action === action);
  if (statusEntry) {
    unit.status = statusEntry.status;
    ledPayload = statusEntry.jsonBody;
  }

  // Send HTTP POST back to the Pukk
  sendLedCommand(unit.ip, ledPayload);

  // Notify all dashboards to update
  io.emit("updateUnits", units);

  res.status(200).send("OK");
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

      sendClockCommand(unit.ip, endingStatus.jsonBody);

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

async function sendLedCommand(ip, payload) {
    await safeFetch(`http://${ip}/api/v1/setLeds`, payload, "LED_CMD");
}

async function sendClockCommand(ip, payload) {
    await safeFetch(`http://${ip}/api/v1/setLeds/clock`, payload, "CLOCK_CMD");
}

const PORT = 3001;
const wifiIp = "192.168.100.50"
server.listen(PORT, "0.0.0.0", () => {
  console.log("-----------------------------------------");
  console.log(`On Wifi-IP Address: ${wifiIp} (SSID PUKK)`);
  console.log(`Server running at http://${wifiIp}:${PORT}/dashboard`);
  console.log("-----------------------------------------");
});
