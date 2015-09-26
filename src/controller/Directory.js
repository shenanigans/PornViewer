
var fs = require ('graceful-fs');
var path = require ('path');
var async = require ('async');
// var gaze = require ('gaze');

function Directory (parent, controller, dirpath, name, extraName) {
    this.parent = parent;
    this.controller = controller;
    this.dirpath = dirpath;
    this.name = name;

    this.children = {};

    // create DOM stuff
    var self = this;
    this.elem = controller.document.createElement ('div');
    this.elem.setAttribute ('class', 'directory');
    this.elem.setAttribute ('data-name', name);
    this.directoryImg = controller.document.createElement ('img');
    this.directoryImg.setAttribute ('src', 'directory.png');
    this.directoryImg.on ('mouseup', function(){ self.toggleOpen(); });
    this.elem.appendChild (this.directoryImg);
    var titleElem = controller.document.createElement ('div');
    titleElem.setAttribute ('class', 'title');
    titleElem.appendChild (controller.document.createTextNode (extraName || name));
    titleElem.on ('mouseup', function(){
        self.open();
        controller.select (dirpath, self.elem);
    });
    this.elem.appendChild (titleElem);
    this.childrenElem = controller.document.createElement ('div');
    this.childrenElem.setAttribute ('class', 'children');
    this.elem.appendChild (this.childrenElem);

    // insert into DOM
    var children = parent.childrenElem.children;
    if (!children.length || children[children.length-1].getAttribute ('data-name') < name)
        parent.childrenElem.appendChild (this.elem);
    else {
        // pretty typically Directories are created in order, so bottom-up linear scan is fine
        var done = false;
        for (var i=children.length-1; i>=0; i--)
            if (children[i].getAttribute ('data-name') < name) {
                parent.childrenElem.insertBefore (this.elem, children[i+1]);
                done = true;
                break;
            }
        if (!done)
            parent.childrenElem.insertBefore (this.elem, children[0]);
    }
}
module.exports = Directory;

Directory.prototype.addChild = function (name) {
    if (Object.hasOwnProperty.call (this.children, name)) {
        this.controller.revealDirectory();
        return this.children[name];
    }
    var child = this.children[name] = new Directory (
        this,
        this.controller,
        path.join (this.dirpath, name),
        name
    );
    this.controller.revealDirectory();
    return child;
};

Directory.prototype.open = function(){
    if (this.isOpen)
        return;
    this.isOpen = true;
    this.elem.addClass ('open');
    this.directoryImg.setAttribute ('src', 'directory_open.png');
    this.controller.revealDirectory();

    var self = this;
    fs.readdir (this.dirpath, function (err, children) {
        if (err) {
            // directory is missing or unreadable
            delete self.parent.children[self.name];
            self.elem.dispose();
            return;
        }

        // trim missing
        var unknown = [];
        var newNames = {};
        for (var i=0,j=children.length; i<j; i++) {
            var child = children[i];
            newNames[child] = true;
            if (!Object.hasOwnProperty.call (self.children, child))
                unknown.push (child);
        }
        var ownChildren = Object.keys (self.children);
        for (var i=0,j=ownChildren.length; i<j; i++)
            if (!Object.hasOwnProperty.call (newNames, ownChildren[i])) {
                var child = ownChildren[i];
                self.children[child].dispose();
                delete self.children[child];
            }

        // unknown keys which are directories should be added
        async.each (unknown, function (newName, callback) {
            fs.stat (path.join (self.dirpath, newName), function (err, stats) {
                if (err || !stats.isDirectory())
                    return callback();
                self.addChild (newName);
            });
        });
    });
};

Directory.prototype.close = function(){
    if (!this.isOpen)
        return;
    this.isOpen = false;
    this.elem.dropClass ('open');
    this.directoryImg.setAttribute ('src', 'directory.png');
};

Directory.prototype.toggleOpen = function(){
    if (this.isOpen)
        this.close();
    else
        this.open();
};
