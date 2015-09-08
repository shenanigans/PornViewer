# PornViewer
An image viewer for mission-critical applications.

## Installation
PornViewer currently does not come pre-built. You can currently build your own for Windows and OSX.
First, clone this repository, download the correct prebuild of [node-webkit 0.12.x]
(https://github.com/nwjs/nw.js#user-content-downloads) for your environment, rename its directory to
`nw` and put it in the PornViewer directory.

```shell
cd PornViewer
npm install
cd src
npm install
npm install -g nw-gyp
cd node_modules/lwip
nw-gyp rebuild
cd ../../
gulp once
```

Finally, use either `launch.sh` or `launch.vbs` to start the application.
