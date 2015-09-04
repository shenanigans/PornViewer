# PornViewer
An image viewer for mission-critical applications.

## Installation
PornViewer currently does not come pre-built. You can currently build your own for Windows and
Linux. First, clone this repository, download the correct [node-webkit]
(https://github.com/nwjs/nw.js/) prebuild for your environment, rename its directory to `nw` and put
it in the PornViewer directory.

```shell
cd PornViewer
npm install
cd src
npm install
npm install -g nw-gyp
cd node_modules/lwip
nw-gyp configure
nw-gyp build
cd ../../
gulp once
```

Finally, use either `launch.sh` or `launch.vbs` to start the application.
