
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var gui = require ('nw.gui');
var Visualizer = require ('./Visualizer');
var Controller = require ('./Controller');
var scum = require ('scum');

var SHOW_EXT = { jpg:'jpg', jpeg:'jpg', gif:'gif', png:'png' };

//
// Presently only a single display mode is supported - the dual window display mode. To rehome the
// Controller and Visualizer together, a pair of iframes should do the trick.
//

var visualizer, controller;

// launch the Controller Window
controllerWindow = gui.Window.open ('./Controller/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornController',
    icon:           'icon.png'
});

// launch the Visualizer Window
visualizerWindow = gui.Window.open ('./Visualizer/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornViewer',
    icon:           'icon.png'
});

var Window = gui.Window.get();
Window.on ('loaded', function(){ Window.showDevTools(); });

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

async.parallel ([
    function (callback) {
        controllerWindow.on ('loaded', function(){
            scum (controllerWindow.window);
            callback();
        });
    },
    function (callback) {
        visualizerWindow.on ('loaded', function(){
            scum (visualizerWindow.window);
            visualizer = new Visualizer (visualizerWindow, window.console);
            // keyboard navigation events
            visualizerWindow.window.document.body.on ('keydown', function (event) {
                if (event.keyCode < 37 || event.keyCode > 40)
                    return;
                controller.go (event.keyCode);
            });
            callback();
        });
    }
], function (err) {
    controller = new Controller (controllerWindow, visualizer, window.console);

    // load opened file or last path
    var openPath;
    if (gui.App.argv.length) {
        openPath = gui.App.argv[0];
        // exists? directory?
        try {
            var stats = fs.statSync (openPath);
            if (stats.isDirectory())
                controller.currentPath = openPath;
            else {
                var pathinfo = path.parse (openPath);
                controller.currentPath = pathinfo.dir;
                var ext = pathinfo.ext.slice(1);
                if (Object.hasOwnProperty.call (SHOW_EXT, ext)) {
                    controller.selectedImagePath = openPath;
                    controller.visualizer.display (openPath, ext);
                }
            }
        } catch (err) { /* fall through */ }
    }
    if (!controller.currentPath && !(controller.currentPath = window.localStorage.lastPath))
        controller.currentPath = window.localStorage.lastPath = process.env[
            process.platform = 'win32' ? 'USERPROFILE' : 'HOME'
        ];

    // reveal path
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
                    controller.selectedImagePath = openPath;
                    controller.visualizer.display (openPath, SHOW_EXT[ext]);
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

    controllerWindow.on ('dragover', function (event) {
        event.preventDefault();
        return false;
    });
    controllerWindow.on ('drop', function (event) {
        event.preventDefault();
        var files = event.dataTransfer.files;
        if (!files.length)
            return false;
        openFile ('PornViewer '+files[files.length-1].path);
        return false;
    });

    visualizerWindow.on ('dragover', function (event) {
        event.preventDefault();
        return false;
    });
    visualizerWindow.on ('drop', function (event) {
        event.preventDefault();
        var files = event.dataTransfer.files;
        if (!files.length)
            return false;
        openFile ('PornViewer '+files[files.length-1].path);
        return false;
    });
});
