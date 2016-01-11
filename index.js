
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var gui = require ('nw.gui');
var Visualizer = require ('./Visualizer');
var Controller = require ('./Controller');
var scum = require ('scum');

var SHOW_EXT = { '.jpg':'jpg', '.jpeg':'jpg', '.gif':'gif', '.png':'png' };
var CONTROLLER_BASE_WIDTH = 295;
var CONTROLLER_MIN_WIDTH = CONTROLLER_BASE_WIDTH + 150;
var CONTROLS_TIMEOUT = 1500;

//
// Presently only a single display mode is supported - the dual window display mode. A few things
// still remain to be factored into this script from the Controller and Visualizer scripts before
// these views will be portable enough to embedded in the same Window.
//

var visualizer, controller;

// launch the Visualizer Window
visualizerWindow = gui.Window.open ('./Visualizer/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornViewer',
    icon:           'icon.png'
});

// launch the Controller Window
controllerWindow = gui.Window.open ('./Controller/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornController',
    icon:           'icon.png'
});

// set up window position
// var winState = window.localStorage.windowState;
var winState;
var screens = gui.Screen.Init().screens;
if (winState) {
    winState = JSON.parse (winState);
    // make sure this state is still displayable

}
if (!winState) {
    if (screens.length > 1) {
        // use two monitors on the bottom right position
        screens.sort (function (able, baker) {
            var aX = able.work_area.x;
            var bX = baker.work_area.x;
            if (aX < bX)
                return -1;
            if (aX > bX)
                return 1;
            var aY = able.work_area.y;
            var bY = baker.work_area.y;
            if (aY < bY)
                return -1;
            if (aY > bY)
                return 1;
            return 0;
        });
        var controllerState = screens[screens.length-2].work_area;
        var visualizerState = screens[screens.length-1].work_area;
        winState = {
            controller: {
                maximize:   true,
                x:          controllerState.x,
                y:          controllerState.y,
                width:      Math.floor (0.7 * controllerState.width),
                height:     Math.floor (0.7 * controllerState.height)
            },
            visualizer: {
                maximize:   true,
                x:          visualizerState.x,
                y:          visualizerState.y,
                width:      Math.floor (0.7 * visualizerState.width),
                height:     Math.floor (0.7 * visualizerState.height)
            }
        };
    } else if (screens.length != 1) {
        winState = {
            controller:{ x:0, y:0, width:CONTROLLER_MIN_WIDTH, height: 600 },
            visualizer:{ x:CONTROLLER_MIN_WIDTH, y:0, width:800 - CONTROLLER_MIN_WIDTH, height: 600 }
        };
    } else {
        var onlyScreen = screens[0].work_area;
        var maxControllerWidth = Math.floor (onlyScreen.width / 2);
        var controllerWidth;
        if (maxControllerWidth <= CONTROLLER_MIN_WIDTH)
            controllerWidth = CONTROLLER_MIN_WIDTH;
        else {
            var rowCount = Math.floor (( maxControllerWidth - CONTROLLER_BASE_WIDTH ) / 150);
            controllerWidth = CONTROLLER_BASE_WIDTH + ( 150 * rowCount );
        }
        winState = {
            controller:     {
                x:              onlyScreen.x,
                y:              onlyScreen.y,
                width:          controllerWidth,
                height:         onlyScreen.height
            },
            visualizer:     {
                x:              onlyScreen.x + controllerWidth,
                y:              onlyScreen.y,
                width:          onlyScreen.width - controllerWidth,
                height:         onlyScreen.height
            }
        };

    }
    // window.localStorage.windowState = JSON.stringify (winState);
}

// uncomment to show devtools at startup
var Window = gui.Window.get();
Window.on ('loaded', function(){
    scum (Window.window);
    var dorkument = Window.window.document;
    // Window.show();
    // Window.showDevTools();

    var payAmount = dorkument.getElementById ('PayAmount');
    payAmount.on ('keypress', function (event) {
        var current = payAmount.value;
        var next = current + String.fromCharCode (event.charCode);
        var nextNum = Number (next);
        if (isNaN (nextNum))
            return false;
        if (nextNum < 5)
            return false;
        return true;
    });

    var payFrame = dorkument.getElementById ('PayFrame');
    payFrame.contentWindow.setup (
        function (token) {
            console.log ('token', token);
        },
        function(){
            payFrame.className = 'active';
        },
        function(){
            payFrame.className = '';
        }
    );
    dorkument.getElementById ('PayMe').on ('click', function(){
        var innerDocument = payFrame.contentDocument.body.children[0].contentDocument;
        var newStyle = innerDocument.createElement ('style');
        newStyle.innerHTML = ".overlayView.active { overflow:hidden !important; }";
        innerDocument.head.appendChild (newStyle);
        payFrame.contentWindow.handle (Math.floor (payAmount.value * 100));
    });
});

// basic cross-window event listeners
controllerWindow.on ('close', function(){
    visualizerWindow.close();
    controllerWindow.close (true);
    shutdown();
});
visualizerWindow.on ('close', function(){
    controllerWindow.close();
    visualizerWindow.close (true);
    shutdown();
});

function shutdown(){

    setTimeout (function(){
        gui.App.quit();
    }, 50);
}

// load opened file or last path
var openPath, openDir, ext;
if (gui.App.argv.length) {
    openPath = gui.App.argv[0];
    // exists? directory?
    try {
        var stats = fs.statSync (openPath);
        if (stats.isDirectory())
            openDir = openPath;
        else {
            var pathinfo = path.parse (openPath);
            openDir = pathinfo.dir;
            if (Object.hasOwnProperty.call (SHOW_EXT, pathinfo.ext))
                ext = pathinfo.ext.slice (1);
            else {
                delete openPath;
                // show an error message
                // TODO
            }
        }
    } catch (err) { /* fall through */ }
}
if (!openDir && !(openDir = window.localStorage.lastPath))
    openDir = window.localStorage.lastPath = process.env[
        process.platform = 'win32' ? 'USERPROFILE' : 'HOME'
    ];

function handleKey (event) {
    if (!event.altKey && !event.ctrlKey) {
        if (event.keyCode >= 37 && event.keyCode <= 40) {
            controller.go (event.keyCode);
            return false;
        } else if (event.keyCode == 32) {
            visualizer.playpause();
            return false;
        }
        return true;
    }

    if (!visualizer.vlc)
        return true;
    var timeShift;
    switch (event.keyCode) {
        case 37:
            timeShift = -15 * 1000;
            break;
        case 38:
            timeShift = 90 * 1000;
            break;
        case 39:
            timeShift = 15 * 1000;
            break;
        case 40:
            timeShift = -90 * 1000;
            break;
        default:
            return true;
    }
    if (event.shiftKey)
        timeShift /= 3;
    visualizer.jump (timeShift);
    return false;
}

// load both windows
async.parallel ([
    function (callback) {
        controllerWindow.on ('loaded', function(){
            scum (controllerWindow.window);
            controllerWindow.x = winState.controller.x;
            controllerWindow.y = winState.controller.y;
            controllerWindow.resizeTo (
                winState.controller.width,
                winState.controller.height
            );
            if (winState.controller.maximize)
                controllerWindow.maximize();

            // setup controls
            // min - max - close
            controllerWindow.window.document.getElementById ('Minimize').on ('click', function(){
                controllerWindow.minimize();
            });
            var maxElem = controllerWindow.window.document.getElementById ('Maximize');
            var isMaximized = false;
            maxElem.on ('click', function(){
                console.log ('maxClick');
                if (isMaximized)
                    controllerWindow.unmaximize();
                else
                    controllerWindow.maximize();
            });
            controllerWindow.on ('maximize', function(){
                console.log ('didMaximize');
                isMaximized = true;
                maxElem.addClass ('restore');
            });
            controllerWindow.on ('unmaximize', function(){
                console.log ('did unMaximize');
                isMaximized = false;
                maxElem.dropClass ('restore');
            });

            // controller ready
            callback();
        });
    },
    function (callback) {
        visualizerWindow.on ('loaded', function(){
            scum (visualizerWindow.window);
            visualizerWindow.x = winState.visualizer.x;
            visualizerWindow.y = winState.visualizer.y;
            visualizerWindow.resizeTo (
                winState.visualizer.width,
                winState.visualizer.height
            );
            if (winState.visualizer.maximize)
                visualizerWindow.maximize();
            visualizer = new Visualizer (visualizerWindow, window.console);

            // setup controls
            // min - max - close
            visualizer.document.getElementById ('Minimize').on ('click', function(){
                visualizerWindow.minimize();
            });
            var maxElem = visualizer.document.getElementById ('Maximize');
            var isMaximized = false;
            maxElem.on ('click', function(){
                console.log ('maxClick');
                if (isMaximized)
                    visualizerWindow.unmaximize();
                else
                    visualizerWindow.maximize();
            });
            visualizerWindow.on ('maximize', function(){
                console.log ('didMaximize');
                isMaximized = true;
                maxElem.addClass ('restore');
            });
            visualizerWindow.on ('unmaximize', function(){
                console.log ('did unMaximize');
                isMaximized = false;
                maxElem.dropClass ('restore');
            });

            // bump controls into view whenever the mouse moves
            var controlsTimer;
            var Theatre = visualizer.document.getElementById ('Theatre');
            function bumpControls(){
                clearTimeout (controlsTimer);
                visualizer.controlsElem.addClass ('visible');
                Theatre.dropClass ('nocurse');
                controlsTimer = setTimeout (function(){
                    visualizer.controlsElem.dropClass ('visible');
                    Theatre.addClass ('nocurse');
                    visualizer.modeSelect.blur();
                }, CONTROLS_TIMEOUT);
            }
            visualizer.document.body.on ('mousemove', bumpControls);
            visualizer.controlsElem.on ('mousemove', bumpControls);

            // keyboard navigation events
            visualizer.document.body.on ('keydown', handleKey);
            if (openPath)
                visualizer.display (openPath, ext);

            // visualizer ready
            callback();
        });
    }
], function (err) {
    if (err) {
        // just fail
        gui.App.quit();
        return;
    }

    // ready to start the controller now
    controller = new Controller (controllerWindow, visualizer, window.console);
    controller.document.body.on ('keydown', handleKey);
    controller.on ('display', function (prawn) {
        console.log ('display', prawn);
        visualizer.display (prawn);
    });
    controller.on ('preload', function (prawn) {
        console.log ('preload', prawn);
        visualizer.preload (prawn);
    });

    // reveal current path
    controller.currentPath = openDir;
    controller.openCurrent (function (err) {
        if (err)
            return;
        if (openPath)
            controller.showImage (undefined, openPath, ext);
    });

    // wait for future file open operations
    function openFile (cmdline) {
        // exists? directory?
        var filename;
        try {
            var openPath;
            if (process.platform == 'win32')
                openPath = /"([^"]+)"$/.exec (cmdline)[1];
            else
                openPath = cmdline.split (/ /g)[1];
            var stats = fs.statSync (openPath);
            if (stats.isDirectory())
                controller.currentPath = openPath;
            else {
                var pathinfo = path.parse (openPath);
                controller.currentPath = pathinfo.dir;
                var ext = pathinfo.ext;
                if (Object.hasOwnProperty.call (SHOW_EXT, ext)) {
                    controller.manualScrolling = false;
                    controller.selectedImagePath = openPath;
                    visualizer.display (openPath, ext.slice (1));
                    visualizerWindow.focus();
                }
            }
        } catch (err) { return false; }

        controller.openCurrent(function (err) {
            if (err)
                return;
            controller.showImage (undefined, openPath);
        });

        return false;
    }
    gui.App.on ('open', openFile);

    controllerWindow.window.on ('dragover', function (event) {
        event.preventDefault();
        return false;
    });
    controllerWindow.window.on ('drop', function (event) {
        event.preventDefault();
        var files = event.dataTransfer.files;
        if (!files.length)
            return false;
        openFile ('PornViewer '+JSON.stringify (files[files.length-1].path));
        return false;
    });

    visualizerWindow.window.on ('dragover', function (event) {
        event.preventDefault();
        return false;
    });
    visualizerWindow.window.on ('drop', function (event) {
        event.preventDefault();
        var files = event.dataTransfer.files;
        if (!files.length)
            return false;
        openFile ('PornViewer '+JSON.stringify (files[files.length-1].path));
        return false;
    });
});
