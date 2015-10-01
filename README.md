# PornViewer
An image viewer for mission-critical applications. Designed to provide a pleasurable viewing
experience. Theoretically cross-platform, currently available on Windows.

![screenshot](http://i.imgur.com/MVzG6xH.jpg)


## Installation
Use one of these installer links below. If you like it, please [help me not be so broke](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PN6C2AZTS2FP8&lc=US&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted).

### Windows Installers
#### 64 bits
 * [0.0.1](https://github.com/shenanigans/PornViewer/releases/download/0.0.1/PornViewer_x64.msi)
 
#### 32 bits
The startup time is slightly slower than the x64 version, but I'm working on it.
 * [0.0.1](https://github.com/shenanigans/PornViewer/releases/download/0.0.1/PornViewer_x86.msi)

### Linux Binaries
I've been having a problem with the `lwip` module, it's supposed to statically bind its own libpng
but it still somehow gets confused by the older version dynamically bound by node-webkit. Probably I
need to build my own node-webkit with libpng bound statically. If anybody has some thoughts on this
I'd love to hear them.

### OSX
Somebody with one of those dumbass apple computers is welcome to figure out a build for them. Mine
bricked out when its stupid battery died. And hey seriously isn't that `.dmg` thing weird as an
install process? Drag this shit into here. Random scripts go off unexpectedly. That's the sleak,
intuitive way to install things. See the [build instructions](#building-pornviewer) near the bottom
if you're thinking of helping out, you communist filth.


## FAQ
Actually that's a lie. Nobody has ever asked me any questions about PornViewer.

#### Is there a safe-for-work version of this?
No. You're welcome to fork this repo and make one. If you want my opinion I think you should call it
`lolphotos`.

#### What's next for PornViewer?
So glad I asked.
 * drag-n-drop file and folder management
 * fake directories called Collections
 * view images from multiple directories or Collections
 * "cascade view"
 * video files


## Building PornViewer
You're going to need [nodejs](https://nodejs.org) and the npm thingy it comes with. Linux users are
advised to **always** install Node.js from source. If you're on Windows, you will need MinGW. I
recommend just using the lovely [command-line git installer](https://git-scm.com/downloads). You 
will need your platform's support files for `gyp` builds. That's build-essential or yummy equivalent 
on linux, xcode on osx and visual studio on windows.

Clone this repository and download the most recent stable version of [node-webkit](https://github.com/nwjs/nw.js#downloads).
Unzip it, put it in the repository directory and rename it `nw`. If you're building a windows msi,
copy the contents of the `nw` directory into `resources\x64\` or `resources\x86\`.

Then do this stuff:
```shell
cd PornViewer
npm install
cd src
npm install
npm install -g nw-gyp
cd node_modules/lwip
nw-gyp clean
nw-gyp configure --target=0.12.3
# on windows use --msvs_version=2013 
# for x86 use --arch=ia32
nw-gyp build
# for x86 use --arch=ia32
cd ../../
gulp once
```

Finally, use either `launch.sh` or `launch.vbs` to start the application. There is a shitton of
unnecessary content left in the `lwip` build and some of the other npm modules as well. Tracking
down and eliminating everything you don't need will drastically improve application launch time.
Remember to `gulp once` after making changes, or simply `gulp` to start a watch-and-rebuild process.

#### Building an MSI
I can't get `copy \b` to work right, maybe it's win10? So I use mingw's `cat` to make the prepacked
executable. Substitute `x86` if you need it.
```shell
cat resources/x64/nw.exe package.zip > build/x64/nw.exe
```

You'll need [WiX](http://wixtoolset.org/). Use a DOS shell to run `winbuild.bat`. This will build
one or two `.msi` files in `build\` depending on which architecture(s) have been prepared
completely.


## LICENSE
The MIT License (MIT)

Copyright (c) 2015 Kevin "Schmidty" Smith

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
