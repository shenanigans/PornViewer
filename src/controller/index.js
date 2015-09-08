
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var package = require ('./package');
var ThumbWarrior = require ('./controller/ThumbWarrior');
var Visualizer = require ('./controller/Visualizer/Visualizer.js');
var gui = require('nw.gui');
// var Collection = require ('./Collection');
var Directory = require ('./controller/Directory');

var document = window.document;
var WarriorElem, warriors, nextWarrior = 0;
var baseController;
require ('scum') (window);
window.on ('load', function(){
    gui.Window.get().show();

    var InfoElem = document.getElementById ('Info');
    var VersionElem = document.createElement ('h2');
    VersionElem.setText (package.version);
    InfoElem.append (VersionElem);
    InfoElem.addClass ('revealed');

    setTimeout (function(){
        document.getElementById ('Splash').addClass ('hidden');
    }, 1000);

    baseController = new Controller (window, document.getElementById ('Lister'));
});

var DRIVE_REGEX = /([\w ]+\w)  +(\w:)/;
function Controller (winnder, hostElem) {
    this.window = winnder;
    this.document = this.window.document;
    this.hostElem = hostElem;

    // keyboard navigation events
    var self = this;
    this.document.body.on ('keydown', function (event) {
        if (event.keyCode < 37 || event.keyCode > 40)
            return true;
        self.go (event.keyCode);
        return false;
    });

    // set up Tree Element
    this.treeElem = this.document.createElement ('div');
    this.treeElem.setAttribute ('id', 'Tree');
    this.root = { children:{}, childrenElem:this.treeElem };
    hostElem.appendChild (this.treeElem);

    // load opened file or last path
    var filename;
    if (gui.App.argv.length > 1) {
        var openPath = gui.App.argv[1];
        // exists? directory?
        try {
            var stats = fs.statSync (openPath);
            if (stats.isDirectory())
                this.currentPath = openPath;
            else {
                var pathinfo = path.parse (openPath);
                self.currentPath = pathinfo.dir;
                filename = pathinfo.base;
            }
        } catch (err) { /* fall through */ }
    }
    if (!this.currentPath && !(this.currentPath = window.localStorage.lastPath))
        this.currentPath = window.localStorage.lastPath = process.env[
            process.platform = 'win32' ? 'USERPROFILE' : 'HOME'
        ];

    // reveal path
    this.openCurrent (function (err) {
        if (err)
            return;
        if (filename)
            self.showImage (undefined, path.join (self.currentPath, filename));
    });

    // wait for future file open operations
    function openFile (cmdline) {
        // exists? directory?
        var filename;
        try {
            var openPath = cmdline.split (/ /g)[1];
            var stats = fs.statSync (openPath);
            if (stats.isDirectory())
                self.currentPath = openPath;
            else {
                var pathinfo = path.parse (openPath);
                self.currentPath = pathinfo.dir;
                filename = pathinfo.base;
            }
        } catch (err) { console.log (err); return false; }

        console.log ('file?', filename);
        self.openCurrent(function (err) {
            console.log ('called back');
            if (err)
                return;
            if (filename)
                self.showImage (undefined, openPath);
        });

        return false;
    }
    gui.App.on ('open', openFile);
    this.window.on ('dragover', function (event) {
        event.preventDefault();
        return false;
    });
    this.window.on ('drop', function (event) {
        event.preventDefault();
        var files = event.dataTransfer.files;
        if (!files.length)
            return false;
        openFile ('PornViewer '+files[files.length-1].path);
        return false;
    });

    // create visualizer
    var visualizer = this.visualizer = new Visualizer (this);
    var nwWindow = gui.Window.get (winnder);
    nwWindow.on ('close', function(){
        nwWindow.close (true);
        visualizer.window.close();
    });

    // on windows we need to enumerate the drives
    if (process.platform == 'win32')
        require('child_process').exec (
            'wmic logicaldisk get description, deviceid',
            function (err, stdout, stderr) {
                if (err) {
                    console.log ('failed to enumerate drives');
                    return;
                }
                driveinfo = stdout.split (/\r\n?/g).slice (1).filter (Boolean).map (function (drive) {
                    var match = DRIVE_REGEX.exec (drive);
                    return { type:match[1], path:match[2] };
                });
                console.log ('enumerated drives', driveinfo);
                for (var i=0,j=driveinfo.length; i<j; i++) {
                    var drive = driveinfo[i];
                    if (Object.hasOwnProperty.call (self.root.children, drive.path)) // already listed
                        continue;
                    var name = drive.path;
                    if (drive.type == 'Removable Disk')
                        name += ' (removable)';
                    self.root.children[drive.path] = new Directory (self.root, self, drive.path, drive.path, name);
                }
            }
        );
}

Controller.prototype.openCurrent = function (listed) {
    var pathArr = this.currentPath
     .split (process.platform == 'win32' ? /[\/\\]/g : '/')
     .filter (Boolean)
     ;
    if (process.platform != 'win32')
        pathArr[0] = '/'+pathArr[0];
    var level = new Directory (this.root, this, pathArr[0], pathArr[0]);
    this.root.children[pathArr[0]] = level;
    level.open();
    for (var i=1,j=pathArr.length; i<j; i++) {
        level = level.addChild (pathArr[i]);
        level.open();
    }

    // select the current path
    this.select (this.currentPath, level.elem, listed);
};

var THUMBS_IN_FLIGHT = 12;
Controller.prototype.select = function (dirpath, elem, listed) {
    if (this.lastSelectedElem) {
        this.lastSelectedElem.dropClass ('selected');
        delete this.lastSelectedElem;
    }
    elem.addClass ('selected');
    this.lastSelectedElem = elem;
    this.selectedPath = dirpath;
    if (this.thumbsElem)
        this.thumbsElem.dispose();
    this.thumbsElem = this.document.createElement ('div');
    this.thumbsElem.setAttribute ('class', 'thumbs');
    delete this.selectedImage;
    this.hostElem.appendChild (this.thumbsElem);

    var self = this;
    fs.readdir (dirpath, function (err, filenames) {
        if (err) {
            if (listed)
                listed (err);
            return;
        }
        var imageNames = [];
        var imageElems = [];
        filenames.forEach (function (fname) {
            var lastThree = fname.slice (-4);
            if (
                lastThree == '.jpg'
             || lastThree == '.gif'
             || lastThree == '.png'
             || fname.slice (-5) == '.jpeg'
            ) {
                imageNames.push (fname);
                var newThumbContainer = self.document.createElement ('div');
                newThumbContainer.setAttribute ('class', 'thumb');
                var imgPath = path.join (dirpath, fname);
                newThumbContainer.setAttribute ('data-path', imgPath);
                newThumbContainer.on ('click', function(){
                    self.showImage (newThumbContainer, imgPath);
                });
                self.thumbsElem.appendChild (newThumbContainer);
                imageElems.push (newThumbContainer);
            }
        });

        if (listed)
            listed();

        async.timesLimit (imageNames.length, THUMBS_IN_FLIGHT, function (imageI, callback) {
            ThumbWarrior.getThumb (dirpath, imageNames[imageI], function (err, thumbPath, padHeight) {
                if (self.selectedPath != dirpath)
                    return callback (new Error ('cancelled'));
                var container = imageElems[imageI];
                if (err) {
                    console.log ('failed', imageNames[imageI], err);
                    container.dispose();
                    if (container === self.selectedImage) {
                        if (container.nextSibling)
                            self.showImage (
                                container.nextSibling,
                                container.nextSibling.getAttribute ('data-path')
                            );
                        else if (container.previousSibling)
                            self.showImage (
                                container.previousSibling,
                                container.previousSibling.getAttribute ('data-path')
                            );
                    }
                    return callback();
                }
                var newThumb = self.document.createElement ('img');
                newThumb.setAttribute ('src', thumbPath);
                if (padHeight)
                    newThumb.setAttribute ('style', 'margin-top:'+padHeight+'px');
                container.appendChild (newThumb);
                callback();
            });
        }, function(){
            self.window.localStorage.lastPath = dirpath;
        });
    });
};

Controller.prototype.showImage = function (thumbElem, imgPath) {
    if (this.selectedImage)
        this.selectedImage.dropClass ('selected');
    if (!thumbElem) {
        // search for thumbElem
        var done = false;
        for (var i=0,j=this.thumbsElem.children.length; i<j; i++)
            if (( thumbElem = this.thumbsElem.children[i] ).getAttribute ('data-path') == imgPath) {
                done = true;
                break;
            }
        if (!done)
            return;
    }
    thumbElem.addClass ('selected');
    this.selectedImage = thumbElem;

    var thumbIndex = Array.prototype.indexOf.call (this.thumbsElem.children, thumbElem);
    if (thumbIndex < 0) // thumb not drawn
        return;
    this.visualizer.display (imgPath);

    // preload nearby thumbs
    if (thumbIndex > 0)
        this.visualizer.preload (this.thumbsElem.children[thumbIndex-1].getAttribute ('data-path'));
    if (thumbIndex + 1 < this.thumbsElem.children.length)
        this.visualizer.preload (this.thumbsElem.children[thumbIndex+1].getAttribute ('data-path'));

    // scroll to view
    var position = thumbElem.getBoundingClientRect();
    var offset = 0;
    if (position.top < 0)
        offset = position.top;
    else if (position.bottom > this.window.innerHeight)
        offset = position.bottom - this.window.innerHeight;
    // KEYWORD extra offset
    this.thumbsElem.scrollTop += offset;
};

Controller.prototype.go = function (direction) {
    if (!this.selectedImage) {
        if (!this.thumbsElem.children.length)
            return;
        this.showImage (this.thumbsElem.firstChild, this.thumbsElem.firstChild.getAttribute ('data-path'));
        this.thumbsElem.scrollTop = 0;
        return;
    }

    var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
    var next = this.selectedImage;
    switch (direction) {
        case 37:
            // go left
            if (!this.selectedImage.previousSibling)
                next = this.thumbsElem.lastChild;
            else
                next = this.selectedImage.previousSibling;
            break;
        case 38:
            // go up
            var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
            if (rowWidth > this.thumbsElem.children.length)
                break;
            var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
            if (currentIndex >= rowWidth)
                currentIndex -= rowWidth;
            else {
                // round the world
                var lastRowLength = this.thumbsElem.children.length % rowWidth;
                if (!lastRowLength)
                    currentIndex = this.thumbsElem.children.length - currentIndex - 1;
                else if (currentIndex >= lastRowLength)
                    currentIndex = this.thumbsElem.children.length - 1;
                else
                    currentIndex = this.thumbsElem.children.length - lastRowLength + currentIndex;
            }
            next = this.thumbsElem.children[currentIndex];
            break;
        case 39:
            // go right
            if (!this.selectedImage.nextSibling)
                return this.showImage (
                    this.thumbsElem.firstChild,
                    this.thumbsElem.firstChild.getAttribute ('data-path')
                );
            next = this.selectedImage.nextSibling;
            break;
        case 40:
            // go down
            var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
            if (rowWidth > this.thumbsElem.children.length)
                break;
            var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
            currentIndex += rowWidth;
            if (currentIndex >= this.thumbsElem.children.length)
                currentIndex = currentIndex % rowWidth;
            next = this.thumbsElem.children[currentIndex];
            break;
    }

    this.showImage (next, next.getAttribute ('data-path'));
};
