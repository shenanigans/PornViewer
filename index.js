
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var needle = require ('needle');
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

var KONAMI = [
    38, 38,
    40, 40,
    37, 39,
    37, 39,
    66, 65
];
var mainWindowOpened = false;
function konamifyWinnder (winnder) {
    var reg = [
        undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined
    ];
    winnder.window.document.body.on ('keyup', function (event) {
        reg.shift();
        reg.push (event.keyCode);
        for (var i=KONAMI.length; i>=0; i--)
            if (reg[i] !== KONAMI[i])
                return;
        winnder.showDevTools();
        if (!mainWindowOpened) {
            mainWindowOpened = true;
            gui.Window.get().showDevTools();
        }
    });
}

// set up window position
var winState = window.localStorage.winState;
var screens = gui.Screen.Init().screens;
if (winState) {
    winState = JSON.parse (winState);
    // make sure this state is still displayable
    // ...or not. Probably the OS is on top of this one.
    // delete winState;
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
}

var Window = gui.Window.get();
var beggarArmed = false;
var alreadyRan = false;
Window.on ('loaded', function(){
    if (alreadyRan) // for some reason this keeps happening lately
        return;
    alreadyRan = true;

    scum (Window.window);
    var dorkument = Window.window.document;

    // uncomment to show the primary console at startup
    // Window.showDevTools();

    // show beggar window immediately
    // Window.show();

    // when working on the beggar window, this stuff about the nag counter needs to be commended out
    var nextNag = window.localStorage.nag;
    if (nextNag == 'NEVER')
        return;
    if (!nextNag) {
        window.localStorage.nag = 10;
        return;
    }
    nextNag = Number (nextNag);
    if (nextNag > 0) {
        window.localStorage.nag = nextNag - 1;
        return;
    }
    window.localStorage.nag = 10;
    beggarArmed = true;

    var payAmount = dorkument.getElementById ('PayAmount');
    payAmount.on ('keypress', function (event) {
        var current = payAmount.value;
        var next = current + String.fromCharCode (event.charCode);
        var nextNum = Number (next);
        if (isNaN (nextNum))
            return false;
        return true;
    });

    var payFrame = dorkument.getElementById ('PayFrame');
    payFrame.contentWindow.setup (
        function (token) {
            needle.post (
                'http://kaztl.com/payment',
                {
                    email:  token.email,
                    token:  token.id,
                    cents:  Math.floor (payAmount.value * 100)
                },
                { json:true, parse:'json' },
                function (err, response) {
                    if (err) {
                        window.alert (
                            '\
A network error occured. Please double check your internet connection \
and try again!'
                        );
                        return;
                    }
                    if (response.statusCode != 200) {
                        window.alert (
                            'An error occured: '
                          + response.body.error
                          + '\nPlease try again!'
                        );
                        return;
                    }

                    // woo! thanks for the moneys!
                    window.localStorage.nag = 'NEVER';
                    window.document.body.innerHTML = '<h1>Thank You!</h1>\n\
<p>Open source software is this developer\'s day job. Therefor, each donation is deeply appreciated \
no matter how big or small. And remember, it\'s all for a good cause: more porn!</p>\n\
<p>And don\'t worry, these guilt-trip naggy messages begging for money will never appear again!</p>';
                    setTimeout (function(){
                        Window.close();
                        setTimeout (function(){
                            gui.App.quit();
                        }, 50);
                    }, 15000);
                }
            );
        },
        function(){
            payFrame.className = 'active';
            payAmount.setAttribute ('disabled', true);
        },
        function(){
            payFrame.className = '';
            payAmount.setAttribute ('disabled', false);
        }
    );
    dorkument.getElementById ('PayMe').on ('click', function(){
        try {
            var innerDocument = payFrame.contentDocument.body.children[0].contentDocument;
            var newStyle = innerDocument.createElement ('style');
            newStyle.innerHTML = ".overlayView.active { overflow:hidden !important; }";
            innerDocument.head.appendChild (newStyle);
        } catch (err) {
            console.log ('could not tweak pay frame document', err);
        }
        payFrame.contentWindow.handle (Math.floor (payAmount.value * 100));
    });

    var alreadyPaidButton = dorkument.getElementById ('EndAnnoyanceButton');
    var alreadyPaidCollapso = dorkument.getElementById ('EndAnnoyanceCollapso');
    alreadyPaidButton.on ('click', function(){
        alreadyPaidCollapso.addClass ('active');
        alreadyPaidButton.dispose();
    });
    var lookupPaymentEmail = dorkument.getElementById ('AlreadyPaidEmail');
    var lookupPaymentButton = dorkument.getElementById ('AlreadyPaidButton');
    lookupPaymentButton.on ('click', function(){
        needle.get (
            'http://kaztl.com/payment?email=' + encodeURIComponent (lookupPaymentEmail.value),
            { parse:'json' },
            function (err, response) {
                if (err) {
                    window.alert (
                        '\
A network error occured. Please double check your internet connection \
and try again!'
                    );
                    return;
                }
                if (response.statusCode != 200) {
                    if (response.statusCode == 404)
                        window.alert (
                            'Your payment could not be found. Are you sure this is the email '
                          + 'address you used to pay before, and have you typed it correctly?'
                        );
                    else
                        window.alert (
                            'An error occured: ' + response.body.error + '\n\nPlease try again!'
                        );
                    return;
                }

                window.localStorage.nag = 'NEVER';
                window.document.body.innerHTML = '<h1>Nagging Deactivated</h1>\n\
<p>Your nag messages have been permanently deactivated. But by the way: Open source software is \
this developer\'s day job. The more you give, the better your porn viewing experience can become!\
</p>';
                setTimeout (function(){
                    Window.close();
                    setTimeout (function(){
                        gui.App.quit();
                    }, 50);
                }, 15000);
            }
        );
    });
});

// basic cross-window event listeners
controllerWindow.on ('close', shutdown);
visualizerWindow.on ('close', shutdown);

var dead = false;
function shutdown(){
    if (dead)
        return;
    dead = true;

    window.localStorage.winState = JSON.stringify ({
        controller:     {
            x:              controllerWindow.x,
            y:              controllerWindow.y,
            width:          controllerWindow.width,
            height:         controllerWindow.height
        },
        visualizer:     {
            x:              visualizerWindow.x,
            y:              visualizerWindow.y,
            width:          visualizerWindow.width,
            height:         visualizerWindow.height
        },
    });

    window.localStorage.prefs_dev_con = JSON.stringify (controller.prefs);
    window.localStorage.prefs_dev_viz = JSON.stringify (visualizer.prefs);
    visualizer.savePron (function (err) {
        controllerWindow.close (true);
        visualizerWindow.close (true);
        // if (beggarArmed) {
        //     beggarArmed = false;
        //     Window.show();
        //     return;
        // }
        setTimeout (function(){
            gui.App.quit();
        }, 1000);
    });
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
            konamifyWinnder (controllerWindow);
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
                if (isMaximized)
                    controllerWindow.unmaximize();
                else
                    controllerWindow.maximize();
            });
            controllerWindow.on ('maximize', function(){
                isMaximized = true;
                maxElem.addClass ('restore');
            });
            controllerWindow.on ('unmaximize', function(){
                isMaximized = false;
                maxElem.dropClass ('restore');
            });
            controllerWindow.window.document.getElementById ('Close').on ('click', shutdown);

            // controller ready
            callback();
        });
    },
    function (callback) {
        visualizerWindow.on ('loaded', function(){
            scum (visualizerWindow.window);
            konamifyWinnder (visualizerWindow);
            visualizerWindow.x = winState.visualizer.x;
            visualizerWindow.y = winState.visualizer.y;
            visualizerWindow.resizeTo (
                winState.visualizer.width,
                winState.visualizer.height
            );
            if (winState.visualizer.maximize)
                visualizerWindow.maximize();
            visualizer = new Visualizer (
                visualizerWindow,
                JSON.parse (window.localStorage.prefs_dev_viz)
            );

            // setup controls
            // min - max - close
            visualizer.document.getElementById ('Minimize').on ('click', function(){
                visualizerWindow.minimize();
            });
            var maxElem = visualizer.document.getElementById ('Maximize');
            var isMaximized = false;
            maxElem.on ('click', function(){
                if (isMaximized)
                    visualizerWindow.unmaximize();
                else
                    visualizerWindow.maximize();
            });
            visualizerWindow.on ('maximize', function(){
                isMaximized = true;
                maxElem.addClass ('restore');
            });
            visualizerWindow.on ('unmaximize', function(){
                isMaximized = false;
                maxElem.dropClass ('restore');
            });
            visualizer.document.getElementById ('Close').on ('click', shutdown);

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
    controller = new Controller (
        controllerWindow,
        visualizer,
        JSON.parse (window.localStorage.prefs_dev_con)
    );
    controller.document.body.on ('keydown', handleKey);
    controller.on ('display', function (prawn) {
        visualizer.display (prawn);
    });
    controller.on ('preload', function (prawn) {
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
