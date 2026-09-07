const express = require('express')
const http = require('http');
const {Server} = require('socket.io');
const path = require('path');
const os = require('os');
const mqtt = require('mqtt');

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

        // console.log("--- RAW INCOMING BODY ---");
        // console.log(rawString);
        // console.log("-------------------------");

        // console.log("HEX representation (to find hidden chars):");
        // console.log(buf.toString('hex').match(/.{1,2}/g).join(' '));
    }
}));

// -------- MQTT Setup --------
const MQTT_BROKER = 'mqtt://';
const MQTT_TOPIC_PREFIX = 'pukk/';
 
const mqttClient = mqtt.connect(MQTT_BROKER, {
	username: '',
	password: '',
});
 
mqttClient.on('connect', () => {
    console.log('-----------------------------------------');
    console.log(`MQTT connected to ${MQTT_BROKER}`);
    console.log('-----------------------------------------');
 
    // Receive device registrations
    mqttClient.subscribe(`${MQTT_TOPIC_PREFIX}register`);
    // Receive events from all devices (+ is single-level wildcard)
    mqttClient.subscribe(`${MQTT_TOPIC_PREFIX}+/events`);
});
 
mqttClient.on('message', (topic, message) => {
    let payload;
	console.log(`MQTT: Received message on topic '${topic}': ${message.toString()}`);
    try {
        payload = JSON.parse(message.toString());
    } catch (e) {
        console.error('MQTT: Failed to parse message:', message.toString());
        return;
    }
 
    // --- Registration ---
    if (topic === `${MQTT_TOPIC_PREFIX}register`) {
        const mac = payload.mac?.toUpperCase();
        if (!mac) return;
 
        let pukk = getPukk(mac);
        pukk.protocol = 'mqtt';
        console.log(`MQTT: Registered ${pukk.name} (${mac})`);
        io.emit('updateUnits', units);
 
        // Send current status command to newly registered device
        const command = statuses.get(pukk.status);
        if (command) {
            mqttClient.publish(`${MQTT_TOPIC_PREFIX}${mac}/commands`, JSON.stringify(command));
        }
        return;
    }
 
    // --- Device event ---
    if (topic.endsWith('/events')) {
        const mac = payload.mac?.toUpperCase();
        const action = payload.action;
        if (!mac || !action) return;
 
        let pukk = getPukk(mac);
        pukk.protocol = 'mqtt';
 
        console.log(`MQTT: Event '${action}' from ${pukk.name} (${mac})`);
 
        // Forward NFC data to dashboard
        if (action === 'nfc' && payload.data) {
            io.emit('nfcData', payload.data);
        }
 
        const status = actions.get(action);
        if (!status) {
            console.log(`MQTT: Unknown action '${action}'`);
            return;
        }
 
        const command = statuses.get(status);
        if (!command) {
            console.log(`MQTT: No command found for status '${status}'`);
            return;
        }
 
        pukk.status = status;
        pukk.lastSeen = Date.now();
        io.emit('updateUnits', units);
 
        // Publish command back to the device that sent the event
        mqttClient.publish(`${MQTT_TOPIC_PREFIX}${mac}/commands`, JSON.stringify(command));
        console.log(`MQTT: Sent command '${command.command}' to ${pukk.name}`);
    }
});
 
mqttClient.on('error', (err) => {
    console.error('MQTT error:', err.message);
});
 
mqttClient.on('disconnect', () => {
    console.warn('MQTT: Disconnected from broker');
});



let units = [];
let nextUnitId = 1;

const color_red = { brightness: 100, red: 255, green: 0, blue: 0 };
const color_green = { brightness: 100, red: 0, green: 255, blue: 0 };
const color_blue = { brightness: 100, red: 0, green: 0, blue: 255 };
const color_white = { brightness: 100, red: 255, green: 255, blue: 255 };
const color_yellow = { brightness: 100, red: 255, green: 255, blue: 0 };

const red_static = {
    color: color_red,
    duration_ms: 0
}
const green_static = {
    color: color_green,
    duration_ms: 0
}
const blue_static = {
    color: color_blue,
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
	],
	[ 'rainbow',
		{
			command: 'set_leds_rainbow',
			led_values: {
				brightness: 100,
				speed_ms: 10,
				duration_ms: 0,
				counter_clockwise: true,
			}
		}
	],
	[ 'marquee',
		{
			command: 'set_leds_marquee',
			led_values: {
				color: color_blue,
				duration_ms: 0,
				speed_ms: 20,
				counter_clockwise: true
			}
		}
	],
	[ 'breathe',
		{
			command: 'set_leds_breathe',
			led_values: {
				color: color_green,
				duration_ms: 0,
				speed_ms: 200,
			}
		}
	], 
	['quads',
		{
			command: 'set_leds_quadrant',
			led_values: {
				quadrants: [
					color_red,
					color_green,
					color_blue,
					{ brightness: 100, red: 255, green: 255, blue: 0 }
				],
				duration_ms: 0,
			}
		}
	], 
	[ 'indiv',
		{	
			command: 'set_leds_individual',
			led_values: {
				colors: [
					color_red,
					color_red,
					color_white,
					color_white,
					color_blue,
					color_blue,
					color_blue,
					color_blue,
					color_white,
					color_white,
					color_red,
					color_red
				],
				duration_ms: 0,
			}
		}
	], 
	[ 'clock',
		{
			command: 'set_leds_clock',
			led_values: {
				initial_color: color_red,
				intermediate_color: color_green,
				end_color: color_blue,
				rotation_time_s: 5,
				counter_clockwise: false
			}
		}
	], 
	[ 'off',
		{
			command: 'set_leds_off',
		}
	], 
	['ukraine',
		{
			command: 'set_leds_individual',
			led_values: {
				colors: [
					color_blue,
					color_blue,
					color_blue,
					color_yellow,
					color_yellow,
					color_yellow,
					color_yellow,
					color_yellow,
					color_yellow,
					color_blue,
					color_blue,
					color_blue
				],
				duration_ms: 0,
			}
		}
	]
])

// -------- Helper: publish command to device (MQTT or flag for HTTP polling) --------
function sendCommand(unit, statusKey) {
    const command = statuses.get(statusKey);
    if (!command) return;
 
    if (unit.protocol === 'mqtt') {
        mqttClient.publish(`${MQTT_TOPIC_PREFIX}${unit.mac}/commands`, JSON.stringify(command));
        console.log(`MQTT: Sent command '${command.command}' to ${JSON.stringify(unit)}`);
    } else {
        unit.hasNew = true;
    }
}

app.get('/dashboard', (req, res) => {
    res.render('index', {pukks: JSON.stringify(units)})
})

// HTTP POST — device event (HTTP mode)
app.post('/', (req, res) => {
    const action = req.query.action ? req.query.action : null;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const ip = req.ip.replace("::ffff:", "");
	console.log(`Received POST request: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
	console.log(`Received request: ${JSON.stringify(req.query)}'`);
    console.log(`Received request from mac:${mac} with action '${action}'`);
	console.log(`Received headers: ${JSON.stringify(req.headers)}`);

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

// HTTP GET — polling (HTTP mode)
app.get('/', (req, res) => {
    const action = req.query.action ? req.query.action : null;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const ip = req.ip.replace("::ffff:", "");
	console.log(`Received GET request: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    console.log(`Received request from mac:${mac} with action '${action}'`);
	console.log(`Received headers: ${JSON.stringify(req.headers)}`);

	if (mac == null) return res.status(404).send({msg: 'Missing MAC Address'});
	let pukk = getPukk(mac);
	if (pukk == null) return res.status(404).send({msg: 'Device not found and could not be added'})

	if (action === "poll") {
		// Polling for the current status
		if (pukk.hasNew) {
			const newStatus = statuses.get(pukk.status);
			pukk.hasNew = false;
			console.log(`Sending status ${pukk.status} to ${pukk.name}`);
			console.log(`Sending status ${pukk.status} with LED values: ${JSON.stringify(newStatus.led_values)}`);
			return res.status(200).send(JSON.stringify(newStatus));
		} else return res.status(204).send({msg: "No action required"});
    }
})

// Dashboard: manually set device status
app.post('/setStatus', (req, res) => {
    const {mac, newStatus} = req.body;
    const device = units.find(u => u.mac === mac);
    if (device && newStatus) {
        device.status = newStatus;
        device.lastSeen = new Date();
        device.hasNew = true;

		sendCommand(device, newStatus);
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
            const endingStatus = statuses.get("ending");
            unit.status = "ending";
            unit.lastSeen = new Date();
			sendCommand(unit, 'ending');
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

            const availableStatus = statuses.get("available");
            unit.status = "available";
            sendCommand(unit, 'available');
            io.emit("updateUnits", units);
        }
    });
}, 1000);



// -------- Helpers --------
function getPukk(mac) {
    let pukk = units.find(u => u.mac === mac);
    if (!pukk) {
        pukk = {
            id: nextUnitId,
            name: `PuKK_${nextUnitId}`,
            status: 'available',
            mac: mac,
            protocol: 'http',   // default, overwritten on first contact
            hasNew: false,
            lastSeen: Date.now(),
        };
        console.log(`Added new PuKK ${pukk.name} with MAC: ${mac}`);
        nextUnitId++;
        units.push(pukk);
    } else {
        pukk.lastSeen = Date.now();
    }
    return pukk;
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
