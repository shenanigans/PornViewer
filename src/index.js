
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var gui = require ('nw.gui');
var Visualizer = require ('./Visualizer');
var Controller = require ('./Controller');
var scum = require ('scum');

var SHOW_EXT = { '.jpg':'jpg', '.jpeg':'jpg', 'gif.':'gif', 'png.':'png' };
var CONTROLLER_BASE_WIDTH = 295;
var CONTROLLER_MIN_WIDTH = CONTROLLER_BASE_WIDTH + 150;

//
// Presently only a single display mode is supported - the dual window display mode. To rehome the
// Controller and Visualizer together, a pair of iframes should do the trick.
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
// var Window = gui.Window.get();
// Window.on ('loaded', function(){ Window.showDevTools(); });

// basic cross-window event listeners
controllerWindow.on ('close', function(){
    visualizerWindow.close();
    controllerWindow.close (true);
    setTimeout(function(){ gui.App.quit(); }, 50);
});
visualizerWindow.on ('close', function(){
    controllerWindow.close();
    visualizerWindow.close (true);
    setTimeout(function(){ gui.App.quit(); }, 50);
});

// load opened file or last path
var openPath, currentPath, ext;
if (gui.App.argv.length) {
    openPath = gui.App.argv[0];
    // exists? directory?
    try {
        var stats = fs.statSync (openPath);
        if (stats.isDirectory())
            currentPath = openPath;
        else {
            var pathinfo = path.parse (openPath);
            currentPath = pathinfo.dir;
            if (!Object.hasOwnProperty.call (SHOW_EXT, pathinfo.ext)) {
                delete openPath;
                // show an error message
                // TODO
            }
        }
    } catch (err) { /* fall through */ }
}
if (!currentPath && !(currentPath = window.localStorage.lastPath))
    currentPath = window.localStorage.lastPath = process.env[
        process.platform = 'win32' ? 'USERPROFILE' : 'HOME'
    ];

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
            // keyboard navigation events
            visualizerWindow.window.document.body.on ('keydown', function (event) {
                if (event.keyCode < 37 || event.keyCode > 40)
                    return;
                controller.go (event.keyCode);
            });
            if (openPath)
                visualizer.display (filepath, ext);
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
    // reveal current path
    controller.currentPath = currentPath;
    controller.openCurrent (function (err) {
        if (err)
            return;
        if (openPath)
            controller.showImage (undefined, openPath);
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
                var ext = pathinfo.ext.slice(1);
                if (Object.hasOwnProperty.call (SHOW_EXT, ext)) {
                    controller.manualScrolling = false;
                    controller.selectedImagePath = openPath;
                    controller.visualizer.display (openPath, SHOW_EXT[ext]);
                    visualizerWindow.restore();
                    visualizerWindow.focus();
                }
            }
        } catch (err) { console.log (err); return false; }

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
