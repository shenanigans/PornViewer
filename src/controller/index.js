
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
require ('scum')(window);
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

    // load current path
    if (!(this.currentPath = window.localStorage.defaultPath))
        window.localStorage.defaultPath = process.env[
            (process.platform=='win32') ?
                'USERPROFILE'
              : 'HOME'
        ];

    // create visualizer
    var visualizer = this.visualizer = new Visualizer (this);
    var nwWindow = gui.Window.get (winnder);
    nwWindow.on ('close', function(){
        nwWindow.close (true);
        visualizer.window.close();
    });

    // open the current path in the Tree
    var pathArr = this.currentPath.split (process.platform == 'win32' ? /[\/\\]/g : '/');
    var level = new Directory (this.root, this, pathArr[0], pathArr[0]);
    level.open();
    for (var i=1,j=pathArr.length; i<j; i++) {
        level = level.addChild (pathArr[i]);
        level.open();
    }

    // select the current path
    this.select (this.currentPath, level.elem);
}

var THUMBS_IN_FLIGHT = 12;
Controller.prototype.select = function (dirpath, elem) {
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

        async.timesLimit (imageNames.length, THUMBS_IN_FLIGHT, function (imageI, callback) {
            ThumbWarrior.getThumb (dirpath, imageNames[imageI], function (err, thumbPath, padHeight) {
                if (self.selectedPath != dirpath)
                    return callback (new Error ('cancelled'));
                if (err) {
                    console.log ('failed', imageNames[imageI], err);
                    imageElems[imageI].dispose();
                    return callback();
                }

                var newThumb = self.document.createElement ('img');
                newThumb.setAttribute ('src', thumbPath);
                if (padHeight)
                    newThumb.setAttribute ('style', 'margin-top:'+padHeight+'px');
                imageElems[imageI].appendChild (newThumb);
                callback();
            });
        });
    });
};

Controller.prototype.showImage = function (thumbElem, imgPath) {
    if (this.selectedImage)
        this.selectedImage.dropClass ('selected');
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

    // scroll if necessary
    // KEYWORD
};

Controller.prototype.go = function (direction) {
    if (!this.selectedImage)
        return;

    var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
    switch (direction) {
        case 37:
            // go left
            if (!this.selectedImage.previousSibling)
                return this.showImage (
                    this.thumbsElem.lastChild,
                    this.thumbsElem.lastChild.getAttribute ('data-path')
                );
            var next = this.selectedImage.previousSibling;
            this.showImage (next, next.getAttribute ('data-path'));
            break;
        case 38:
            // go up
            var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
            if (rowWidth > this.thumbsElem.children.length)
                return;
            var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
            if (currentIndex < rowWidth) {
                var lastRowLength = this.thumbsElem.children.length % rowWidth;
                if (!lastRowLength)
                    currentIndex += this.thumbsElem.children.length;
                else if (currentIndex > lastRowLength)
                    currentIndex = this.thumbsElem.children.length - 1;
                else
                    currentIndex += ( Math.floor (this.thumbsElem.children.length / rowWidth) * rowWidth);
            } else
                currentIndex -= rowWidth;
            var next = this.thumbsElem.children[currentIndex];
            this.showImage (next, next.getAttribute ('data-path'));
            break;
        case 39:
            // go right
            if (!this.selectedImage.nextSibling)
                return this.showImage (
                    this.thumbsElem.firstChild,
                    this.thumbsElem.firstChild.getAttribute ('data-path')
                );
            var next = this.selectedImage.nextSibling;
            this.showImage (next, next.getAttribute ('data-path'));
            break;
        case 40:
            // go down
            var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
            if (rowWidth > this.thumbsElem.children.length)
                return;
            var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
            currentIndex += rowWidth;
            if (currentIndex >= this.thumbsElem.children.length)
                currentIndex = currentIndex % rowWidth;
            var next = this.thumbsElem.children[currentIndex];
            this.showImage (next, next.getAttribute ('data-path'));
            break;
    }
};
