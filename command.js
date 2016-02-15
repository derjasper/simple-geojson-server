var net = require('net');

if (process.argv.length < 4) {
  console.log("Usage: node command.js socket command [args...] ");
  process.exit(1);
}

var socket = process.argv[2];
var command = process.argv[3];
for (var i=4; i<process.argv.length; i++) {
  command += " "+process.argv[i];
}

const client = net.connect(socket, function () {
  client.write(command);
});
client.on('data', function (data) {
  console.log(data.toString());
  client.end();
});
client.on('end', function () {
});
