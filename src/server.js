const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// --- PATH CONFIGURATION ---
const viewsPath = path.join(__dirname, '../views');
const publicPath = path.join(__dirname, '../public');

// --- VIEW ENGINE & STATIC FILES ---
app.set('view engine', 'ejs');
app.set('views', viewsPath);
app.use(express.static(publicPath));

// --- DATA ---
let units = [
    { id: 1, name: 'Pukk 1', status: "available", mac: "00:1A:2B:3C:4D:5E", ip: "192.168.1.101"}
];

// --- ROUTES ---
app.get("/dashboard", (req, res) => {
    res.render("index", { units: JSON.stringify(units) });
});

app.post("/rename", (req, res) => {
    const { mac, newName } = req.body;
    const unit = units.find(u => u.mac === mac);

    if (unit && newName) {
        unit.name = newName;
        // Broadcast the name change to all dashboards
        io.emit('updateUnits', units);
        return res.status(200).send("Name updated");
    }
    res.status(404).send("Unit not found");
});

app.post("/setStatus", (req, res) => {
	const { mac, newStatus } = req.body;
	const unit = units.find(u => u.mac === mac);
	if (unit && newStatus) {
		unit.status = newStatus;
		// Broadcast the status change to all dashboards
		io.emit('updateUnits', units);
		return res.status(200).send("Status updated");
	}
	res.status(404).send("Unit not found");
})

// Pukk Webhook
app.post("/", (req, res) => {
    const action = req.query.action;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const pukkIp = req.ip.replace('::ffff:', ''); 

    if (!mac || !action) return res.status(400).send("Missing MAC/Action");

    let unit = units.find(u => u.mac === mac);
    
    if (!unit) {
        unit = {
            id: units.length + 1,
            name: `Pukk ${units.length + 1}`,
            status: "available",
            mac: mac,
            ip: pukkIp
        };
        units.push(unit);
    } else {
        unit.ip = pukkIp;
    }

    // Logic: Server decides status and LED color based on action
    let ledPayload = { command: "setLeds", color: [0, 255, 0] }; // Default Green

    if (action === "short_press") {
        unit.status = "occupied";
        ledPayload = {
			"ledValues": {
			  "type": 2,
			  "red": 255,
			  "green": 0,
			  "blue": 0,
			  "wait_ms": 0,
			  "speed_ms": 0,
			  "brightness": 100
			}
		  }
    } else if (action.includes("long_press_3s")) {
        unit.status = "offline";
        ledPayload = {
			"ledValues": {
			  "type": 2,
			  "red": 0,
			  "green": 0,
			  "blue": 0,
			  "wait_ms": 0,
			  "speed_ms": 0,
			  "brightness": 100
			}
		  }
    } else if (action.includes("double_press")) {
        unit.status = "available";
        ledPayload = {
			"ledValues": {
			  "type": 2,
			  "red": 0,
			  "green": 255,
			  "blue": 0,
			  "wait_ms": 0,
			  "speed_ms": 0,
			  "brightness": 100
			}
		  }
    }

    // Send HTTP POST back to the Pukk
    sendLedCommand(unit.ip, ledPayload);

    // Notify all dashboards to update
    io.emit('updateUnits', units);

    res.status(200).send("OK");
});

const PORT = 3001;
server.listen(PORT, "0.0.0.0", () => {
    console.log("-----------------------------------------");
    console.log(`Server running at http://localhost:${PORT}/dashboard`);
    console.log("-----------------------------------------");
});


async function sendLedCommand(ip, payload) {
	const data = JSON.stringify(payload);
	const options = {
		hostname: ip,
		body: data,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': data.length
		}
	}

	await fetch(`http://${ip}/setLeds`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});
}