# PuKK Overview
The PuKK Overview is a demo system that documents the integration of the PuKK Workspace devices by ProDVX.

The server and front-end are made in JavaScript/EJS, but can be modified and used to suit your needs.

Since this is just a demo, there might be some (UI) bugs that may or may not be addressed in the future. This should not hinder the explanation of the integration of the PuKK Workspace devices.

## Main Workflow
Any PuKK that has the CMS Server Address to the host address of this Overview server, will be making requests to this server. The server will respond by adding it to the list of PuKKs that it knows of, with the PuKK IP address, MAC address and the current moment in time (Last Seen). 

The server keeps the current state of all the registered PuKKs.
Whenever a PuKK makes a request (endpoint "/"), it gets handled by the server which dictates what should happen (to that specific PuKK). In most cases, this means the LED ring of the PuKK should be updated. This is done via the sendLedCommand. This sends a request to the IP of the PuKK with the endpoint `/setLeds` and a JSON body with the specific values that the LED ring should be. If the values are valid, the PuKKs LED ring will turn, and a response 200 will be sent back.

## Installation
The following section describes how to set up the server and PuKK devices to communicate properly.

### Prerequisites
- Node is installed

### Installation Steps
1. Download the .zip from "Code" -> "Download ZIP".
2. Open the PuKK_Overview folder in a command prompt / terminal.
3. Run `npm install`. This will install the required packages (ejs, nodemon, socket.io and express)
4. Run `npm run dev`. This will start the server on your local network. The IP address and port(3001 by default) are shown in the terminal. You can ctrl+click the link to open it in your browser.

### Configuration
To configure your PuKK Devices, ensure the CMS Server Address field is set to the following address where the IP address is the address that you got in Step 4 of the installation:

`http://<ip-address>:3001`


## Documentation
See the [User and Integration manual](https://www.dropbox.com/scl/fi/o6r9lufva4mzccbxaqou2/PuKK_Manual_v1.0.pdf?rlkey=9eowzmr6038c3p9r6zas8a6g7&st=9rpdm99u&dl=0) for the full guide on how the PuKK Workspace devices function and how to integrate them into your system.

See the [REST API Specification](https://www.dropbox.com/scl/fi/zd7ylq0fs30gasmtutjna/REST_API_Specification_v1.0.html?rlkey=8lm3vl1dk4aexdqo7f36p6h3z&st=cbocvvpy&dl=0) for more details on which requests can be sent.



## MIT License
Copyright (c) [2026] [ProDVX]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
