# PornViewer
An image and video viewer designed to provide a pleasurable viewing experience for pornographic
material. This doesn't necessarily make it poor at viewing regular photos and videos. While
theoretically cross-platform, it is currently only available on Windows.

![screenshot](http://i.imgur.com/MVzG6xH.jpg)

## Why
Win10 deprecated good ol' photo and fax viewer which for me beat everything else I tried. I built it
in [nw.js](http://nwjs.io/) because I have an inappropriately close relationship with Node. I didn't
build it in Electron **A** because I've done nw.js once before and **B** because the Electron 
maintainers seem to like ES6 and I disagree, packaging is a lil twisty, and some other kinda trivial 
irks.

<img align="right" src="http://i.imgur.com/47esyCO.png" />

 * clean design that doesn't waste your pixels or time
 * versatile keyboard controls
 * uses libvlc to play a generous assortment of video formats
 * picks video thumbnails from a more useful point in the video, which is surprisingly helpful
 * skip the part in a video with somebody's dumb sweaty face hogging the screen
 * animated gifs play with a pretty high quality upscale, it's nice
 * pretty fast thumbnail caching and sorting with a tight thumbnail view

## How
 * Use dem arrow keys.
 * Use alt/option or control with dem arrow keys to skip your videos. Add shift for less skippage.
 * Right click in the viewing area, or tap alt.
 * move images or directories around by dragging and dropping them.

## Caveats
You're gonna use a healthy chunk of your OS drive for thumbnails. Think 1-5 gigabytes. If you ever
run the uninstaller and it takes a solid three minutes, that's the thumbnails.

Windows users, think carefully before activating the file association options during install. The
associated image type's non-thumbnail icon will become a lil dickbutt and double-clicking image files
anywhere on the system will launch a window called PornViewer. You can at least be assured that it
will **not** briefly show the last-viewed image as I consider this feature a priority.

## Installation
Use one of these installer links below. If you like it, please [help me not be so broke](https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=PN6C2AZTS2FP8&lc=US&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted).

### Windows Installer
 * [0.2.1](https://github.com/shenanigans/PornViewer/releases/download/0.2.1/PornViewer_x86.msi)

### Linux Binaries
I've been having a problem with the `lwip` module, it's supposed to statically bind its own libpng
but it still somehow gets confused by the older version dynamically bound by node-webkit. Probably I
need to build my own node-webkit with libpng bound statically. If anybody has some thoughts on this
I'd love to hear them. Now that there's video support involved I'm kinda intimidated by this whole
problem so it might be a while before I get a linux build up.

### OSX
My dumbass apple laptop bricked out when its battery died. If you wanna try it yourself, see the
[build instructions](#building-pornviewer) near the bottom.


## Infrequently Asked Questions
#### Is there a safe-for-work version of this?
No. You're welcome to fork this repo and make one. If you want my opinion I think you should call it
`lolphotos`.

#### What's next for PornViewer?
 * fake directories called collections
 * browse from multiple directories or collections at once
 * "cascade view" will tile images (including gifs) to fill the entire monitor with scrolling porn


## Building PornViewer
You're going to need [nodejs](https://nodejs.org) and the npm thingy it comes with. Linux users are
advised to **always** install Node.js from source. If you're on Windows, you will need MinGW. I
recommend just using the lovely [command-line git installer](https://git-scm.com/downloads). You
will need your platform's support files for `gyp` builds. That's build-essential or yummy equivalent
on linux, xcode on osx and visual studio 2013 (it **must** be 2013) on windows.

Clone this repository and download the most recent stable version of
[node-webkit](https://github.com/nwjs/nw.js#downloads). Unzip it, put it in the repository
directory and rename it `nw`. If you're building a windows msi, copy the contents of the `nw`
directory into a new directory called `resources\x64\` or `resources\x86\`.

Then do this stuff:
```shell
cd PornViewer
npm install
npm install -g nw-gyp
```

#### Setting Up [`lwip`](https://github.com/EyalAr/lwip)
```shell
cd node_modules/lwip
nw-gyp clean
nw-gyp configure --target=0.12.3
# on windows add --msvs_version=2013
# for x86 add --arch=ia32
nw-gyp build
# for x86 add --arch=ia32
cd ../../
```

#### Setting Up [`webchimera.js`](https://github.com/RSATom/WebChimera.js)
If you're very very lucky, this will "just work". If not, you'll need to deal with customizing your
distribution of the `webchimera.js` package. You'll find it at
`node_modules\wcjs-renderer\node_modules\webchimera.js`.
On Win10 x64 I habitually use [`wcjs-prebuilt`](https://github.com/Ivshti/wcjs-prebuilt) and just
rename its directory. Note that on windows x64 you currently need to use [both](https://github.com/Ivshti/wcjs-prebuilt/issues/10#issuecomment-149008366)
of [these](https://github.com/Ivshti/wcjs-prebuilt/issues/10#issuecomment-149201701) manual patches.

#### Launching
Use either `launch.sh` or `launch.vbs` to start the application from the source directory.

#### Building an MSI
You'll need [WiX](http://wixtoolset.org/). Use a DOS shell to run `winbuild.bat`. This will build
one or two `.msi` files in `build\` depending on which architecture(s) have been prepared
completely. Commands for an arch with no resource files provided will fail quickly and fairly
quietly.


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
