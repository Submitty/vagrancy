import vagrant = require('node-vagrant');
import fs = require('fs-extra');
import net = require('net');
import path = require('path');
import crypto = require("crypto");

declare module 'node-vagrant' {
  interface Machine {
    up(args?: string | string[]): Promise<string>;
    destroy(args?: string | string[]): Promise<string>;
  }
}

interface ReflectReturn {
  data: any;
  status: "PASSED" | "FAILED";
};

function reflect(p: Promise<any>): Promise<any> {
  return p.then(
    (v): ReflectReturn => ({data: v, status: "PASSED" }),
    (e): ReflectReturn => ({data: e, status: "FAILED" })
  );
}

function cleanupBuild(machines: {[image: string]: vagrant.Machine}, workspace_folder: string | null): void {
  let promises: Promise<string>[] = [];
  for (let image in machines) {
    promises.push(new Promise((resolve, reject): void => {
      machines[image].destroy(image).then((): void => {
        resolve(image);
      }).catch((err): void => {
        console.log(err);
        reject(image);
      });
    }));
  }
  Promise.all(promises.map(reflect)).then((results): void => {
    let failed = results.filter((x): boolean => x.status === 'FAILED');
    if (failed.length > 0) {
      console.log('FAILED TO DESTROY:');
      for (let result of failed) {
        console.log(`  ${result.data}`);
      }
    }
    if (workspace_folder) {
      fs.remove(workspace_folder);
    }
  });
}

// disable submissions for built images
process.env.NO_SUBMISSIONS = "1";

const vagrancy_path = '/tmp/vagrancy';
const socket_path = path.resolve(vagrancy_path, 'vagrancy.sock');

const submitty_path = path.resolve('..', 'Submitty');
let images: string[] = [];

const vagrant_file = fs.readFileSync(
  path.resolve(submitty_path, 'Vagrantfile'),
  {encoding: 'utf8'}
);
const regex = new RegExp(/.+\.vm\.define '(.+)'/g);

let exec;
while (exec = regex.exec(vagrant_file)) {
  images.push(exec[1].trim());
}

vagrant.promisify();
if (fs.existsSync(socket_path)) {
  fs.unlinkSync(socket_path);
}

console.log(`VAGRANCY PATH: ${vagrancy_path}`);
console.log(`SUBMITTY_PATH: ${submitty_path}`);
console.log(`SOCKET_PATH:   ${socket_path}`);
console.log(`IMAGES:`);
for (let image of images) {
  console.log(`  ${image}`);
}
console.log();

const server = net.createServer();
server.on('connection', (socket): void => {
  console.log('CONNECTED');
  let workspace_folder: string | null = null;
  let machines: {[image: string]: vagrant.Machine} = {};
  let cleaned_up = false;
  socket.on('data', (): void => {
    const workspace_id = crypto.randomBytes(16).toString("hex");
    workspace_folder = path.resolve(vagrancy_path, workspace_id);
    socket.write(`IMAGES: ${images.join(', ')}`);
    console.log(`SETTING UP WORKSPACE: ${workspace_folder}`);
    fs.copySync(submitty_path, workspace_folder);
    console.log(`BUILDING MACHINES...`);
    let promises: Promise<string>[] = [];
    for (let image of images) {
      let machine = vagrant.create({cwd: workspace_folder});
      machines[image] = machine;
      machine.on('up-progress', (data): void => {
        data = data.trim();
        if (data === '') {
          return;
        }
        console.log(data.trim());
        socket.write(data.trim());
      });
      promises.push(new Promise((resolve, reject): void => {
        machine.up(image).then((): void => {
          resolve(image);
        }).catch((): void => {
          reject(image);
        });
      }));
    }

    Promise.all(promises.map(reflect)).then((results): void => {
      for (let result of results) {
        let resp = `FINISHED IMAGE: ${result.data} -> ${result.status.toUpperCase()}`;
        console.log(resp);
        socket.write(resp);
      }
      if (!cleaned_up) {
        cleanupBuild(machines, workspace_folder);
        cleaned_up = true;
      }
    });
  });

  socket.on('error', (): void => {
    if (!cleaned_up) {
      cleanupBuild(machines, workspace_folder);
      cleaned_up = true;
    }
    socket.destroy();
  });

  socket.on('close', (): void => {
    console.log('CLOSED');
    if (!cleaned_up) {
      cleanupBuild(machines, workspace_folder);
      cleaned_up = true;
    }
  });
});

server.listen(socket_path);
console.log(`LISTENING: ${socket_path}`);
console.log();

function signalHandler(): void {
  console.log('closing server');
  server.close();
}
process.on('SIGINT', signalHandler);
process.on('SIGTERM', signalHandler);
