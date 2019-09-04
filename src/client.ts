import net = require('net');

const socket_path = '/tmp/vagrancy/vagrancy.sock';
let images: string[];

const client = net.createConnection(socket_path, (): void => {
  console.log(`CONNECTED TO: ${socket_path}`);
  client.write('I am client!');
});

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', (data: Buffer | string): void => {
  data = data.toString();
  console.log('DATA: ' + data);
  if (data.startsWith('IMAGES: ')) {
    images = data.substr('IMAGES: '.length).trim().split(',').map((x): string => x.trim());
  }
  // Close the client socket completely
  if (data.startsWith('FINISHED')) {
    console.log(JSON.stringify(images));
    client.destroy();
  }
});

// Add a 'close' event handler for the client socket
client.on('close', (): void => {
  console.log('Connection closed');
});
