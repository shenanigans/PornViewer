
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var gaze = require ('gaze');
var ThumbWarrior = require ('./ThumbWarrior');
// var Collection = require ('./Collection');
var Directory = require ('./Directory');
var sorter = require ('./FilenameSorter');

var DRIVE_REGEX = /([\w ]+\w)  +(\w:)/;
function Controller (winnder, visualizer, console) {
    this.window = winnder;
    this.document = winnder.window.document;
    this.console = console;
    this.visualizer = visualizer;

    // keyboard navigation events
    this.hostElem = this.document.getElementById ('Host');
    var self = this;
    this.document.body.on ('keydown', function (event) {
        if (event.keyCode < 37 || event.keyCode > 40)
            return true;
        self.go (event.keyCode);
        return false;
    });

    // bar buttons
    this.document.getElementById ('Minimize').on ('click', function(){
        self.window.minimize();
    });
    var maxElem = this.document.getElementById ('Maximize');
    maxElem.on ('click', function(){
        if (self.isMaximized)
            self.window.unmaximize();
        else
            self.window.maximize();
    });
    winnder.on ('maximize', function(){
        self.isMaximized = true;
        maxElem.addClass ('restore');
    });
    winnder.on ('unmaximize', function(){
        self.isMaximized = false;
        maxElem.dropClass ('restore');
    });

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

    this.document.getElementById ('Close').on ('click', function(){
        self.window.close();
    });

    // controls
    this.thumbsTop = this.document.getElementById ('Controls').getBoundingClientRect().bottom;
    this.sortSelect = this.document.getElementById ('Sort');
    this.sortBy = 'name';
    this.sortSelect.on ('change', function(){
        self.sortBy = self.sortSelect.value;
        // sort existing
        var potemkin = [];
        Array.prototype.push.apply (potemkin, self.thumbsElem.children);
        var attr = 'data-'+self.sortBy;
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
            if (self.sortBy == 'name') {
                if (aVal > bVal)
                    return 1;
                if (aVal == bVal)
                    return 0;
                return -1;
            }

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

    // on windows we need to enumerate the drives
    if (process.platform == 'win32')
        require('child_process').exec (
            'wmic logicaldisk get description, deviceid',
            function (err, stdout, stderr) {
                if (err) {
                    self.console.log ('failed to enumerate drives', err);
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

var THUMBS_IN_FLIGHT = 12;
Controller.prototype.select = function (dirpath, elem, listed) {
    if (this.lastSelectedElem) {
        this.lastSelectedElem.dropClass ('selected');
        delete this.lastSelectedElem;
    }
    elem.addClass ('selected');
    this.lastSelectedElem = elem;

    var self = this;
    if (this.gazer)
        this.gazer.close();
    this.gazer = new gaze.Gaze ('*', { cwd:dirpath });
    this.gazer.on ('ready', function (watcher) { console.log ('ready', watcher); });
    this.gazer.on ('added', function (filepath) {

    });
    this.gazer.on ('changed', function (filepath) {

    });
    this.gazer.on ('deleted', function (filepath) {

    });
    this.gazer.on ('renamed', function (newPath, oldPath) {

    });

    // new <div.thumbs>
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
    fs.readdir (dirpath, function (err, filenames) {
        if (err) {
            if (listed)
                listed (err);
            return;
        }
        filenames.sort (sorter);
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
                newThumbContainer.setAttribute ('data-name', fname);
                var imgPath = path.join (dirpath, fname);
                newThumbContainer.setAttribute ('data-path', imgPath);
                newThumbContainer.on ('click', function(){
                    self.showImage (newThumbContainer, imgPath);
                    self.manualScrolling = false;
                    self.revealThumb();
                });
                self.thumbsElem.appendChild (newThumbContainer);
                imageElems.push (newThumbContainer);
            }
        });

        if (listed)
            listed();

        async.timesLimit (imageNames.length, THUMBS_IN_FLIGHT, function (imageI, callback) {
            ThumbWarrior.getThumb (dirpath, imageNames[imageI], function (err, thumbPath, padHeight, stats) {
                if (self.selectedPath != dirpath)
                    return callback (new Error ('cancelled'));
                var container = imageElems[imageI];
                if (err) {
                    self.console.log ('thumbnail failed', imageNames[imageI], err);
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

                container.setAttribute ('data-type', stats.type);
                container.setAttribute ('data-size', stats.size);
                container.setAttribute ('data-created', stats.created);
                container.setAttribute ('data-modified', stats.modified);

                // drag handlers
                container.setAttribute ('draggable', 'true');
                container.on ('drag', function (event) {
                    event.stopPropagation();
                    container.addClass ('dragging');
                });
                var filename = container.getAttribute ('data-name');
                var dragURL =
                    'image/'
                  + stats.type
                  + ':'
                  + filename
                  + ':file://'
                  + container.getAttribute ('data-path')
                  ;
                container.on ('dragstart', function (event) {
                    event.stopPropagation();
                    // for dragging out of the app
                    event.dataTransfer.setData ('DownloadURL', dragURL);
                    // for dragging within the app
                    event.dataTransfer.setData (
                        'application/json',
                        JSON.stringify ({
                            type:   'image',
                            path:   path.join (dirpath, imageNames[imageI]),
                            name:   filename
                        })
                    );
                });
                container.on ('dragend', function(){
                    container.dropClass ('dragging');
                });

                var newThumb = self.document.createElement ('img');
                newThumb.setAttribute ('src', thumbPath);
                if (padHeight)
                    newThumb.setAttribute ('style', 'margin-top:'+padHeight+'px');
                container.appendChild (newThumb);

                // sorting
                if (self.sortBy == 'name')
                    return callback();
                container.dispose();
                var attr = 'data-'+self.sortBy;
                var value = stats[self.sortBy];
                var thumbs = self.thumbsElem.children;
                var other = thumbs[0].getAttribute (attr);
                if (other === null || Number (other) <= value) {
                    self.thumbsElem.insertBefore (container, thumbs[0]);
                    return callback();
                }
                other = thumbs[thumbs.length-1].getAttribute (attr);
                if (other !== null && Number (other) >= value) {
                    self.thumbsElem.appendChild (container);
                    return callback();
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
                    other = Number (other);
                    if (other <= value) {
                        var prior = thumbs[i-1].getAttribute (attr);
                        if (prior === null || prior >= value) {
                            self.thumbsElem.insertBefore (container, thumbs[i]);
                            done = true;
                            break;
                        }
                        next = Math.floor (middle -= step);
                        continue;
                    }
                    next = Math.floor (middle += step);
                } while (i != next);
                if (!done)
                    self.thumbsElem.insertBefore (container, thumbs[i+1]);

                self.revealThumb();
                callback();
            });
        }, function(){
            window.localStorage.lastPath = dirpath;
        });
    });
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

Controller.prototype.showImage = function (thumbElem, imgPath, ext) {
    if (this.selectedImage)
        this.selectedImage.dropClass ('selected');
    var thumbIndex;
    if (!thumbElem) {
        // search for thumbElem
        var done = false;
        for (var i=0,j=this.thumbsElem.children.length; i<j; i++)
            if (( thumbElem = this.thumbsElem.children[i] ).getAttribute ('data-path') == imgPath) {
                done = true;
                thumbIndex = i;
                break;
            }
        if (!done)
            return;
    }
    thumbElem.addClass ('selected');
    this.selectedImage = thumbElem;

    if (thumbIndex === undefined)
        thumbIndex = Array.prototype.indexOf.call (this.thumbsElem.children, thumbElem);
    if (thumbIndex < 0) // thumb not drawn
        return;

    this.revealThumb();
    if (this.selectedImagePath == imgPath)
        return;
    this.selectedImagePath = imgPath;
    this.visualizer.display (imgPath, ext || thumbElem.getAttribute ('data-type'));

    // preload nearby thumbs
    clearTimeout (this.preloadJob);
    var self = this;
    this.preloadJob = setTimeout (function(){
        var thumbCount = self.thumbsElem.children.length;
        if (thumbCount >= 3) {
            if (thumbIndex > 0)
                self.visualizer.preload (self.thumbsElem.children[thumbIndex-1].getAttribute ('data-path'));
            if (thumbIndex + 1 < self.thumbsElem.children.length)
                self.visualizer.preload (self.thumbsElem.children[thumbIndex+1].getAttribute ('data-path'));
            var rowWidth = Math.floor (self.thumbsElem.clientWidth / self.selectedImage.clientWidth);
            if (thumbCount >= rowWidth) {
                self.visualizer.preload (self.lookUp().getAttribute ('data-path'));
                if (thumbCount > 2 * rowWidth)
                    self.visualizer.preload (self.lookDown().getAttribute ('data-path'));
            }
        }
    }, 50);
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

    if (!this.selectedImage) {
        if (!this.thumbsElem.children.length)
            return;
        if (direction > 38) {
            this.showImage (
                this.thumbsElem.firstChild,
                this.thumbsElem.firstChild.getAttribute ('data-path')
            );
            this.thumbsElem.scrollTop = 0;
        } else {
            this.showImage (
                this.thumbsElem.lastChild,
                this.thumbsElem.lastChild.getAttribute ('data-path')
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
                    this.thumbsElem.firstChild.getAttribute ('data-path')
                );
            next = this.selectedImage.nextSibling;
            break;
        case 40:
            // go down
            next = this.lookDown();
            break;
    }

    this.showImage (next, next.getAttribute ('data-path'));
};
