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

let units = []
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

let statuses = [
    {
        status: 'occupied',
        command: 'set_leds',
        led_values: red_static,
    },
    {
        status: 'available',
        command: 'set_leds',
        led_values: green_static,
    },
    {
        status: 'busy',
        command: 'set_leds_rainbow',
        led_values: {
            brightness: 100,
            speed_ms: 10,
            duration_ms: 0,
            counter_clockwise: false,
        }
    },
    {
        status: 'ota',
        command: 'ota',
        ota_url: "https://www.example.com/",
        led_values: blue_static,
    }
]

app.get('/dashboard', (req, res) => {
    res.render('index', {pukks: JSON.stringify(units)})
})

app.post('/', (req, res) => {
    const action = req.query.action ? req.query.action : null;
    const mac = req.query.mac ? req.query.mac.toUpperCase() : null;
    const ip = req.ip.replace("::ffff:", "");
    console.log(`Received Poll from ip:${ip} and mac:${mac}`);

    let pukk = units.find(u => u.mac === mac)
    if (!pukk) {
        let newPukk = {
            id: nextUnitId,
            name: `PuKK_${nextUnitId}`,
            status: 'available',
            mac: mac,
            ip: ip,
            hasNew: true,
            lastSeen: Date.now(),
        }
        console.log(`Added new PuKK ${newPukk.name} to IP: ${ip} and MAC: ${mac}`);
        units.push(newPukk);
        pukk = newPukk;
    } else {
        pukk.ip_address = ip;
        pukk.lastSeen = Date.now();
    }

    if (action === "poll" && !pukk.hasNew) {
        return res.status(204).send({status: "No action required"})
    }
    console.log(`Sending status ${pukk.status} to ${pukk.name}`);
    const jsonBody = statuses.find(s => s.status === pukk.status);
    console.log(jsonBody);
    io.emit("updateUnits", units);
    pukk.hasNew = false;
    return res.status(200).send(JSON.stringify(jsonBody));
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