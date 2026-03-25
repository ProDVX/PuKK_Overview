const express = require('express')
const http = require('http');
const {Server} = require('socket.io');
const path = require('path');
const os = require('os');

const app = express()
const server = http.createServer(app);
const port = 3030
const io = new Server(server);

const viewsPath = path.join(__dirname, "./views");
const publicPath = path.join(__dirname, "./public");

app.set("view engine", "ejs");
app.set("views", viewsPath);
app.use(express.static(publicPath));

app.use(express.json({
    verify: (req, res, buf, encoding) => {
        const rawString = buf.toString();

        console.log("--- RAW INCOMING BODY ---");
        console.log(rawString);
        console.log("-------------------------");

        console.log("HEX representation (to find hidden chars):");
        console.log(buf.toString('hex').match(/.{1,2}/g).join(' '));
    }
}));

let units = [];
let nextUnitId = 1;

const red_static = {
    color: {
        brightness: 100,
        red: 255,
        green: 0,
        blue: 0,
    },
    duration_ms: 0
}
const green_static = {
    color: {
        brightness: 100,
        red: 0,
        green: 255,
        blue: 0,
    },
    duration_ms: 0
}
const blue_static = {
    color: {
        brightness: 100,
        red: 0,
        green: 255,
        blue: 0,
    },
    duration_ms: 0
}

const actions = new Map([
		["short_press", "available"],
		["double_press", "occupied"],
		["long_press_3s", "busy"],
		["nfc", "occupied"]
])

let statuses = new Map([
    [ 'occupied',
		{
			command: 'set_leds',
        	led_values: red_static,
		}
	],
	[ 'available',
		{
			command: 'set_leds',
			led_values: green_static,
		}
	],
	[ 'busy',
		{
			command: 'set_leds_rainbow',
			led_values: {
				brightness: 100,
				speed_ms: 10,
				duration_ms: 0,
				counter_clockwise: false,
			}
		}
	],
	[ 'ending',
		{
			command: 'set_leds_clock',
			led_values: {
				initial_color: {
				brightness: 0,
				red: 0,
				green: 0,
				blue: 0
				},
				intermediate_color: {
				brightness: 0,
				red: 0,
				green: 0,
				blue: 0
				},
				end_color: {
				brightness: 0,
				red: 0,
				green: 0,
				blue: 0
				},
				rotation_time_s: 0,
				counter_clockwise: false
			}
		}
	],
	[ 'ota',
		{
			command: 'ota',
        	led_values: blue_static,
		}
	]
])

app.get('/dashboard', (req, res) => {
    res.render('index', {pukks: JSON.stringify(units)})
})

app.post('/', (req, res) => {
    const action = req.query.action ? req.query.action : null;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const ip = req.ip.replace("::ffff:", "");
    console.log(`Received request from mac:${mac} with action '${action}'`);

    let pukk = getPukk(mac);

	if (action==="nfc") {
		if (req.body.data) {
		  let nfcData = req.body.data
		  io.emit('nfcData', nfcData);
		}
	  }

	// Handle Status based on action	
	const status = actions.get(action);
	if (status == undefined){
		console.log(`status undefined for action ${action}`)
		return res.status(404).send({msg: `Action ${action} was not found`});
	}
	
	// console.log(`Found action: ${foundAction}`)
	const newStatus = statuses.get(status);
	if (newStatus == undefined) {
		console.log(`newStatus undefined`)		
		return res.status(404).send({msg: `No status found with ${action}`});
	}
	pukk.status = status;
	
	pukk.hasNew = false;
	console.log(`Sending status ${status} to ${pukk.name}`);
    io.emit("updateUnits", units);
    return res.status(200).send(JSON.stringify(newStatus));
})

app.get('/', (req, res) => {
    const action = req.query.action ? req.query.action : null;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const ip = req.ip.replace("::ffff:", "");
    console.log(`Received request from mac:${mac} with action '${action}'`);

	if (mac == null) return res.status(404).send({msg: 'Missing MAC Address'});
	let pukk = getPukk(mac);
	if (pukk == null) return res.status(404).send({msg: 'Device not found and could not be added'})

	if (action === "poll") {
		// Polling for the current status
		if (pukk.hasNew) {
			const newStatus = statuses.get(pukk.status);
			pukk.hasNew = false;
			return res.status(200).send(JSON.stringify(newStatus));
		} else return res.status(204).send({msg: "No action required"});
    }
})

app.post('/setStatus', (req, res) => {
    const {mac, newStatus} = req.body;
    const device = units.find(u => u.mac === mac);
    if (device && newStatus) {
        device.status = newStatus;
        device.lastSeen = new Date();
        device.hasNew = true;
        io.emit("updateUnits", units);
        return res.status(200).send("Status updated")
    }
    return res.status(404).send('Not found');
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

            io.emit("updateUnits", units);
        }
    });
}, 1000);

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

function getPukk(mac){ 
	let pukk = units.find(u => u.mac === mac);
    if (pukk == undefined) {
		console.log(`pukk undefined`)
        let newPukk = {
			id: nextUnitId,
            name: `PuKK_${nextUnitId}`,
            status: 'available',
            mac: mac,
            hasNew: true,
            lastSeen: Date.now(),
        }
        console.log(`Added new PuKK ${newPukk.name} with MAC: ${mac}`);
        units.push(newPukk);
        pukk = newPukk;
    } else {
        pukk.lastSeen = Date.now();
    }
	return pukk;
}

app.use((err, req, res, next) => {
    console.error("SERVER ERROR:", err.stack);
    res.status(500).send("Internal Server Error");
});

const wifiIp = getLocalIp();
server.listen(port, "0.0.0.0", () => {
    console.log("-----------------------------------------");
    console.log(`Server running at http://${wifiIp}:${port}`);
    console.log("-----------------------------------------");
})