vagrancy
========

A testing uility application for use within submitty-buildbot for
helping to test whether or not all images defined in a Vagrantfile
can be built.

Usage looks something like this:

1. On host machine, run `./dist/server.js` which spawns a unix socket.
1. In submitty-buildbot docker-compose, define a worker that mounts
    that unix socket.
1. In submitty-buildbot worker, run `./dist/client.js` which connects to
    the socket and kicks off a fresh Vagrant build.
1. vagrancy will build the image, and then report back which images
    successfully built and which ones failed to build.
1. submitty-buildbot worker then reports which images failed to build
    and if all did build, pass the job, and then disconnect from vagrancy.
1. On closing of remote socket, vagrancy will clean-up the directory used
    for building the image and any created VirtualBox VMs.

vagrancy itself handles building images as follows:

1. Read in Vagrantfile from path to Submitty/Submitty repo on host machine,
    detecting all defined images.
1. On receiving a socket connection, copy the Submitty repo to a unique
    temporary directory to serve as its workspace.
1. Run `vagrant up <image_name>` in parallel for all images.
1. After all images succeed or fail, report back status to connecting socket.
1. Delete all created VMs.
1. Delete created workspace folder.
