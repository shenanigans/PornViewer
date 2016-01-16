
var fs = require ('fs');
var path = require ('path');
var EventEmitter = require ('events').EventEmitter;
var util = require ('util');
var async = require ('async');
var surveil = require ('surveil');
var ThumbWarrior = require ('./ThumbWarrior');
// var Collection = require ('./Collection');
var Directory = require ('./Directory');
var FilenameSorter = require ('./FilenameSorter');
var Pron = require ('Pron');

var DRIVE_REGEX = /([\w ]+\w)  +(\w:)/;
var KNOWN_EXT = [ '.jpg', '.jpeg', '.png', '.gif', '.wmv', '.avi', '.mkv', '.rm', '.mp4', '.m4v' ];
var IMAGE_EXT = [ '.jpg', '.jpeg', '.png', '.gif' ];
var IMAGE_EXT_MAP =  { '.jpg':true, '.jpeg':true, '.png':true, '.gif':true };

var UP = 38;
var RIGHT = 39;
var DOWN = 40;
var LEFT = 37;
function Controller (winnder, visualizer, prefs) {
    EventEmitter.call (this);
    this.window = winnder;
    this.document = winnder.window.document;
    this.visualizer = visualizer;
    this.warrior = new ThumbWarrior (this.document);
    this.prefs = prefs || {};

    this.hostElem = this.document.getElementById ('Host');
    var self = this;

    this.initialResizeClip = 100; // limit the initially rapid resize watchdog poll
    var currentWidth = this.document.body.clientWidth;
    var currentHeight = this.document.body.clientHeight;
    function resize (event) {
        if (currentWidth != self.document.body.clientWidth
         || currentHeight != self.document.body.clientHeight
        ) {
            currentWidth = self.document.body.clientWidth;
            currentHeight = self.document.body.clientHeight;
            self.revealDirectory();
            self.revealThumb();

            // handle interval timing
            if ( initialInterval && ( !event || !--self.initialResizeClip ) ) {
                clearInterval (initialInterval);
                initialInterval = undefined;
                delete initialInterval;
                setInterval (resize, 1000);
            }
        }
    }
    // when the window first resizes at startup, the resize event isn't sent. We have to poll.
    var initialInterval = setInterval (resize, 100);
    winnder.on ('resize', resize);

    // controls
    this.thumbsTop = this.document.getElementById ('Controls').getBoundingClientRect().bottom;
    this.sortSelect = this.document.getElementById ('Sort');
    this.sortBy = this.prefs.sort || 'name';
    this.sortSelect.value = this.sortBy;
    this.sortSelect.on ('change', function(){
        self.prefs.sort = self.sortBy = self.sortSelect.value;
        // sort existing
        var potemkin = [];
        Array.prototype.push.apply (potemkin, self.thumbsElem.children);
        var attr = 'data-'+self.sortBy;
        if (self.sortBy == 'name')
            potemkin.sort (function (able, baker) {
                aVal = able.getAttribute (attr);
                bVal = baker.getAttribute (attr);
                if (aVal === null)
                    if (bVal === null)
                        return 0;
                    else
                        return 1;
                else if (bVal === null)
                    return -1;
                return FilenameSorter (aVal, bVal);
            });
        else
            potemkin.sort (function (able, baker) {
                aVal = able.getAttribute (attr);
                bVal = baker.getAttribute (attr);
                if (aVal === null)
                    if (bVal === null)
                        return 0;
                    else
                        return 1;
                else if (bVal === null)
                    return -1;
                aVal = Number (aVal);
                bVal = Number (bVal);
                if (aVal > bVal)
                    return -1;
                if (aVal == bVal)
                    return 0;
                return 1;
            });
        for (var i=0,j=potemkin.length; i<j; i++)
            self.thumbsElem.appendChild (potemkin[i]);
    });

    // set up Tree Element
    this.treeTop = this.document.getElementById ('Bar').getBoundingClientRect().bottom;
    this.treeElem = this.document.getElementById ('Tree');
    if (this.prefs.treeWidth)
        this.treeElem.setAttribute ('style', 'width:' + this.prefs.treeWidth + 'px;');
    var root = this.root = { children:{}, childrenElem:this.treeElem, getDir:function (dir) {
        var dirFrags = dir
         .split (process.platform == 'win32' ? /[\/\\]/g : /\//g)
         .filter (Boolean)
         ;
        var pointer = root;
        for (var i=0,j=dirFrags.length; i<j; i++)
            if (!Object.hasOwnProperty.call (pointer.children, dirFrags[i]))
                return;
            else
                pointer = pointer.children[dirFrags[i]];
        return pointer;
    }};
    this.root.root = root;

    // tree resize bar
    var resizeBar = this.document.getElementById ('ResizeBar');
    var resizingTree = false;
    resizeBar.on ('mousedown', function(){
        resizingTree = true;
        return false;
    });
    this.document.body.on ('mousemove', function (event) {
        if (!resizingTree)
            return;
        var newWidth = Math.max (
            100,
            Math.min (
                event.clientX - 8,
                self.window.window.innerWidth - 100
            )
        );
        self.treeElem.setAttribute ('style', 'width:' + newWidth + 'px;');
        self.prefs.treeWidth = newWidth;
    });
    this.document.body.on ('mouseup', function(){ resizingTree = false; });
    this.document.body.on ('mouseleave', function(){ resizingTree = false; });

    // slideshow controls
    var slideshowInterval, slideDirection;
    var slideshowControls = this.document.getElementById ('SlideshowControls');
    var slideshowSeconds = this.document.getElementById ('SlideshowSeconds');
    slideshowSeconds.on ('keypress', function (event) {
        var current = slideshowSeconds.value;
        var next = current + String.fromCharCode (event.charCode);
        var nextNum = Number (next);
        if (isNaN (nextNum))
            return false;
        self.prefs.slide = seconds;
        if (slideDirection)
            slide (nextNum);
        return true;
    });
    slideshowSeconds.on ('change', function(){
        var seconds = Number (slideshowSeconds.value);
        if (isNaN (seconds))
            return false;
        self.prefs.slide = seconds;
        if (slideDirection)
            slide (seconds);
        return true;
    });
    function slide (seconds) {
        if (!seconds) {
            seconds = Number (slideshowSeconds.value);
            if (isNaN (seconds))
                return;
            self.prefs.slide = seconds;
        }
        seconds = Math.max (seconds, 0.5);
        clearInterval (slideshowInterval);
        slideshowInterval = setInterval (function(){
            self.go (slideDirection);
            var newTime = Number (slideshowSeconds.value);
            if (newTime === seconds || isNaN (newTime))
                return;
            slide (newTime);
        }, seconds * 1000);
        slideshowControls.addClass ('playing');
    }
    this.document.getElementById ('SlideshowRight').on ('click', function(){
        slideDirection = RIGHT;
        slide();
    });
    this.document.getElementById ('SlideshowLeft').on ('click', function(){
        slideDirection = LEFT;
        slide();
    });
    this.document.getElementById ('SlideshowPause').on ('click', function(){
        clearInterval (slideshowInterval);
        delete slideDirection;
        slideshowControls.dropClass ('playing');
    });

    // on windows we need to enumerate the drives
    if (process.platform == 'win32')
        require('child_process').exec (
            'wmic logicaldisk get description, deviceid',
            function (err, stdout, stderr) {
                if (err) {
                    console.log ('failed to enumerate drives', err);
                    return;
                }
                driveinfo = stdout.split (/\r\n?/g).slice (1).filter (Boolean).map (function (drive) {
                    var match = DRIVE_REGEX.exec (drive);
                    return { type:match[1], path:match[2] };
                });
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
util.inherits (Controller, EventEmitter);
module.exports = Controller;

Controller.prototype.revealDirectory = function (target) {
    clearTimeout (this.revealTimeout);
    var self = this;
    if (!target)
        target = self.lastSelectedElem;
    this.revealTimeout = setTimeout (function(){
        // scroll to view
        if (!target)
            return;
        var position = target.getBoundingClientRect();
        var offset = 0;
        if (position.top < self.treeTop)
            offset = position.top - self.treeTop;
        else if (position.bottom > self.treeElem.clientHeight + self.treeTop)
            offset = Math.min (
                position.bottom - self.treeElem.clientHeight - self.treeTop,
                position.top - self.treeTop
            );
        if (!offset)
            return;
        self.treeElem.scrollTop += offset;
    }, 100);
};

Controller.prototype.openCurrent = function (listed) {
    var pathArr = this.currentPath
     .split (process.platform == 'win32' ? /[\/\\]/g : /\//g)
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

Controller.prototype.createContainer = function (prawn) {
    var container = this.document.createElement ('div');
    container.setAttribute ('class', prawn.isVideo ? 'thumb video loading' : 'thumb loading');
    container.setAttribute ('data-name', prawn.filename);
    container.setAttribute ('data-path', prawn.fullpath);

    var filenameElem = this.document.createElement ('div');
    filenameElem.setAttribute ('class', 'filename');
    var filenameTextElem = this.document.createElement ('div');
    filenameTextElem.setAttribute ('class', 'text');
    filenameTextElem.appendChild (this.document.createTextNode (prawn.filename));
    filenameElem.appendChild (filenameTextElem);
    var whiteoutElem = this.document.createElement ('div');
    whiteoutElem.setAttribute ('class', 'whiteout');
    filenameElem.appendChild (whiteoutElem);
    container.appendChild (filenameElem);

    var self = this;
    container.on ('click', function(){
        self.showImage (container, prawn);
        self.manualScrolling = false;
        self.revealThumb();
    });

    // drag handlers
    container.setAttribute ('draggable', 'true');
    container.on ('drag', function (event) {
        event.stopPropagation();
        container.addClass ('dragging');
    });
    var filename = container.getAttribute ('data-name');
    container.on ('dragstart', function (event) {
        event.stopPropagation();
        if (!prawn.stats)
            return false
        // for dragging out of the app
        var dragURL = 'image/' + prawn.stats.type + ':' + prawn.filename + ':file://' + prawn.fullpath;
        event.dataTransfer.setData ('DownloadURL', dragURL);
        // for dragging within the app
        event.dataTransfer.setData (
            'application/json',
            JSON.stringify ({
                type:   'image',
                path:   container.getAttribute ('data-path'),
                name:   prawn.filename
            })
        );
    });
    container.on ('dragend', function(){
        container.dropClass ('dragging');
    });
    return container;
};

var THUMBS_IN_FLIGHT = 12;
var NUM_ATTRS = { created:true, modified:true, size:true };
Controller.prototype.select = function (dirpath, elem, listed) {
    if (this.lastSelectedElem) {
        this.lastSelectedElem.dropClass ('selected');
        delete this.lastSelectedElem;
    }
    elem.addClass ('selected');
    this.lastSelectedElem = elem;

    var self = this;
    if (this.watcher)
        this.watcher.close();
    var start = (new Date()).getTime();
    this.watcher = surveil (dirpath);
    this.watcher.on ('add', function (filename) {
        for (var i=0,j=KNOWN_EXT.length; i<j; i++) {
            var ext = KNOWN_EXT[i];
            if (filename.slice (-1*ext.length) === ext) {
                var prawn = new Pron (self.warrior, dirpath, filename);
                self.pronMap[filename] = prawn;
                var container = self.createContainer (prawn);
                prawn.on ('thumb', function (thumbPath, padHeight, stats) {
                    if (self.selectedPath != dirpath)
                        return;
                    self.sortThumb (container, thumbPath, padHeight, stats);
                    self.revealThumb();
                });
                prawn.on ('error', function (err) {
                    container.dispose();
                });
                return;
            }
        }
    });
    this.watcher.on ('change', function (filepath) {
        var container, oldThumbPath;
        for (var i=0,j=self.thumbsElem.children.length; i<j; i++)
            if (self.thumbsElem.children[i].getAttribute ('data-name') == filepath) {
                container = self.thumbsElem.children[i];
                oldThumbPath = container.firstChild.getAttribute ('src');
                if (oldThumbPath)
                    oldThumbPath.replace (/\?\d+$/, '');
                break;
            }

        self.pronMap[filepath].updateThumbnail (oldThumbPath);
    });
    this.watcher.on ('remove', function (filepath) {
        // linear scan for filepath and dispose the first matching container
        Pron.removeThumb (self.selectedPath, filepath);
        for (var i=0,j=self.thumbsElem.children.length; i<j; i++)
            if (self.thumbsElem.children[i].getAttribute ('data-name') == filepath) {
                self.thumbsElem.children[i].dispose();
                return;
            }
    });
    this.watcher.on ('error', function (err) {
        console.log ('watcher error', filepath);
    });

    // this.watcher.on ('ready', function (err) {
    //     console.log ('watcher ready in', (new Date()).getTime() - start, 'ms');
    // });

    this.selectedPath = dirpath;
    if (this.thumbsElem)
        this.thumbsElem.dispose();
    this.thumbsElem = this.document.createElement ('div');
    this.thumbsElem.on ('scroll', function(){
        if (self.autoScrolling)
            self.autoScrolling = false;
        else
            self.manualScrolling = true;
    });

    this.thumbsElem.setAttribute ('class', 'thumbs');
    delete this.selectedImage;
    this.hostElem.insertBefore (this.thumbsElem, this.hostElem.firstChild);

    // begin listing
    this.pronMap = {};
    fs.readdir (dirpath, function (err, filenames) {
        if (err) {
            if (listed)
                listed (err);
            return;
        }
        filenames.sort (FilenameSorter);
        filenames.forEach (function (fname) {
            for (var i=0,j=KNOWN_EXT.length; i<j; i++) {
                var ext = KNOWN_EXT[i];
                if (fname.slice (-1*ext.length) === ext) {
                    var prawn = new Pron (self.warrior, dirpath, fname);
                    self.pronMap[fname] = prawn;
                    var container = self.createContainer (prawn);
                    self.thumbsElem.appendChild (container);
                    prawn.on ('thumb', function (thumbPath, padHeight, stats) {
                        if (self.selectedPath != dirpath)
                            return;
                        self.sortThumb (container, thumbPath, padHeight, stats);
                        self.revealThumb();
                    });
                    prawn.on ('error', function (err) {
                        container.dispose();
                    });
                    return;
                }
            }
        });

        if (listed)
            listed();

        window.localStorage.lastPath = dirpath;
    });
};

Controller.prototype.sortThumb = function (container, thumbPath, padHeight, stats) {
    if (thumbPath) {
        if (
            container.lastChild.previousSibling
         && container.lastChild.previousSibling.nodeName == 'IMG'
        )
            container.lastChild.previousSibling.dispose();
        container.dropClass ('loading');
        var newThumb = this.document.createElement ('img');
            newThumb.setAttribute ('src', thumbPath + '?' + (new Date()).getTime());
        if (padHeight)
            newThumb.setAttribute ('style', 'margin-top:'+padHeight+'px');
        container.insertBefore (newThumb, container.lastChild);
    }
    if (stats) {
        container.setAttribute ('data-type', stats.type);
        container.setAttribute ('data-size', stats.size);
        container.setAttribute ('data-created', stats.created);
        container.setAttribute ('data-modified', stats.modified);
    }

    if (!this.thumbsElem.children.length) {
        this.thumbsElem.appendChild (container);
        return;
    }
    if (this.thumbsElem.children.length == 1 && container.parentNode)
        return;
    var attr = 'data-'+this.sortBy;
    var isNumAttr = Object.hasOwnProperty.call (NUM_ATTRS, this.sortBy);
    var value = container.getAttribute (attr);
    if (value) {
        if (isNumAttr)
            value = Number (value);
    } else {
        if (!container.parentNode)
            this.thumbsElem.appendChild (container);
        return;
    }

    container.dispose();

    // test whether the container should go before or after the entire set
    var thumbs = this.thumbsElem.children;
    var other = thumbs[0].getAttribute (attr);
    if (isNumAttr) {
        if (other)
            other = Number (other);
        if (other === null || other <= value) {
            this.thumbsElem.insertBefore (container, thumbs[0]);
            return;
        }
    } else if (other === null || FilenameSorter (value, other) <= 0) {
        this.thumbsElem.insertBefore (container, thumbs[0]);
        return;
    }
    other = thumbs[thumbs.length-1].getAttribute (attr);
    if (isNumAttr) {
        if (other)
            other = Number (other);
        if (other !== null || other >= value) {
            this.thumbsElem.appendChild (container);
            return;
        }
    } else if (other !== null && FilenameSorter (other, value) <= 0) {
        this.thumbsElem.appendChild (container);
        return;
    }

    var middle = thumbs.length / 2;
    var step = middle;
    var next = Math.floor (middle);
    var i;
    var done = false;
    do {
        step /= 2;
        i = next;
        other = thumbs[i].getAttribute (attr);
        if (other === null) {
            next = Math.floor (middle -= step);
            continue;
        }
        if (isNumAttr) {
            other = Number (other);
            if (other <= value) {
                var prior = Number (thumbs[i-1].getAttribute (attr));
                if (prior >= value) {
                    this.thumbsElem.insertBefore (container, thumbs[i]);
                    done = true;
                    break;
                }
                next = Math.floor (middle -= step);
                continue;
            }
            next = Math.floor (middle += step);
        } else {
            if (FilenameSorter (value, other) <= 0) {
                var prior = thumbs[i-1].getAttribute (attr);
                if (FilenameSorter (prior, value) <= 0) {
                    this.thumbsElem.insertBefore (container, thumbs[i]);
                    done = true;
                    break;
                }
                next = Math.floor (middle -= step);
                continue;
            }
            next = Math.floor (middle += step);
        }
    } while (i != next);
    if (!done)
        this.thumbsElem.insertBefore (container, thumbs[i+1]);
};

/**     @member/Function revealThumb
    If autoscrolling is enabled, scrolls the thumb container Element to reveal the [currently
    selected thumbnail](#selectedImage).
*/
Controller.prototype.revealThumb = function(){
    if (this.manualScrolling) // don't autoscroll while the user is trying to scroll
        return;
    if (!this.thumbsElem || !this.selectedImage)
        return;

    var position = this.selectedImage.getBoundingClientRect();
    var offset = 0;
    if (position.top < this.thumbsTop)
        offset = position.top - this.thumbsTop;
    else if (position.bottom > this.window.window.innerHeight)
        offset = position.bottom - this.window.window.innerHeight;

    if (offset > 0)
        offset = Math.floor (offset);
    else
        offset = Math.ceil (offset);
    if (!offset)
        return;

    this.autoScrolling = true;
    this.thumbsElem.scrollTop += offset;
};

Controller.prototype.showImage = function (thumbElem, prawn) {
    if (typeof prawn == 'string')
        if (Object.hasOwnProperty.call (this.pronMap, prawn))
            prawn = this.pronMap[prawn];
        else
            return;
    if (this.selectedImage)
        this.selectedImage.dropClass ('selected');
    // var thumbIndex;
    if (!thumbElem) {
        // search for thumbElem
        var done = false;
        for (var i=0,j=this.thumbsElem.children.length; i<j; i++)
            if (( thumbElem = this.thumbsElem.children[i] ).getAttribute ('data-path') == prawn.fullpath) {
                done = true;
                // thumbIndex = i;
                break;
            }
        if (!done)
            return;
    }
    thumbElem.addClass ('selected');
    this.selectedImage = thumbElem;

    this.revealThumb();
    if (this.selectedImagePath == prawn.fullpath)
        return;
    this.selectedImagePath = prawn.fullpath;
    this.emit ('display', prawn);

    // preload nearby thumbs
    // if (thumbIndex === undefined)
    //     thumbIndex = Array.prototype.indexOf.call (this.thumbsElem.children, thumbElem);
    // if (thumbIndex < 0) // thumb not drawn
    //     return;
    // clearTimeout (this.preloadJob);
    // var self = this;
    // this.preloadJob = setTimeout (function(){
    //     var thumbCount = self.thumbsElem.children.length;
    //     if (thumbCount >= 3) {
    //         if (thumbIndex > 0)
    //             self.emit ('preload', self.thumbsElem.children[thumbIndex-1].getAttribute ('data-path'));
    //             // self.visualizer.preload (self.thumbsElem.children[thumbIndex-1].getAttribute ('data-path'));
    //         if (thumbIndex + 1 < self.thumbsElem.children.length)
    //             self.emit ('preload', self.thumbsElem.children[thumbIndex+1].getAttribute ('data-path'));
    //             // self.visualizer.preload (self.thumbsElem.children[thumbIndex+1].getAttribute ('data-path'));
    //         var rowWidth = Math.floor (self.thumbsElem.clientWidth / self.selectedImage.clientWidth);
    //         if (thumbCount >= rowWidth) {
    //             self.emit ('preload', self.lookUp().getAttribute ('data-path'));
    //             // self.visualizer.preload (self.lookUp().getAttribute ('data-path'));
    //             if (thumbCount > 2 * rowWidth)
    //                 self.emit ('preload', self.lookDown().getAttribute ('data-path'));
    //                 // self.visualizer.preload (self.lookDown().getAttribute ('data-path'));
    //         }
    //     }
    // }, 50);
};

Controller.prototype.lookUp = function(){
    var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
    var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
    if (rowWidth > this.thumbsElem.children.length)
        return currentIndex;
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
    return this.thumbsElem.children[currentIndex];
};

Controller.prototype.lookDown = function(){
    var rowWidth = Math.floor (this.thumbsElem.clientWidth / this.selectedImage.clientWidth);
    var currentIndex = Array.prototype.indexOf.call (this.thumbsElem.children, this.selectedImage);
    if (rowWidth > this.thumbsElem.children.length)
        return currentIndex;
    currentIndex += rowWidth;
    if (currentIndex >= this.thumbsElem.children.length)
        currentIndex = currentIndex % rowWidth;
    return this.thumbsElem.children[currentIndex];
};

Controller.prototype.go = function (direction) {
    // keyboard overrides manual scrolling
    this.manualScrolling = false;

    if (!this.thumbsElem.children.length)
        return;

    if (!this.selectedImage) {
        if (direction > 38) {
            this.showImage (
                this.thumbsElem.firstChild,
                this.pronMap[this.thumbsElem.firstChild.getAttribute ('data-name')]
            );
            this.thumbsElem.scrollTop = 0;
        } else {
            this.showImage (
                this.thumbsElem.lastChild,
                this.pronMap[this.thumbsElem.lastChild.getAttribute ('data-name')]
            );
            this.thumbsElem.scrollTop = this.thumbsElem.scrollHeight;
        }
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
            next = this.lookUp();
            break;
        case 39:
            // go right
            if (!this.selectedImage.nextSibling)
                return this.showImage (
                    this.thumbsElem.firstChild,
                    this.pronMap[this.thumbsElem.firstChild.getAttribute ('data-name')]
                );
            next = this.selectedImage.nextSibling;
            break;
        case 40:
            // go down
            next = this.lookDown();
            break;
    }

    this.showImage (next, this.pronMap[next.getAttribute ('data-name')]);
};
