
var fs = require ('fs');
var path = require ('path');
var gaze = require ('gaze');

function Collection (parent, controller, dirpath, name) {
    this.parent = parent;
    this.controller = controller;
    this.dirpath = dirpath;
    this.name = name;

    this.children = {};

    // create DOM stuff
    this.elem = this.document.createElement ('div');
    this.elem.setAttribute ('class', 'collection');
    this.elem.setAttribute ('data-name', name);
    var collectionImg = this.document.createElement ('img');
    collectionImg.setAttribute ('src', 'controller/collection.png');
    this.elem.appendChild (collectionImg);
    this.elem.appendChild (this.document.createTextNode (name));
    this.childrenElem = this.document.createElement ('div');
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
                parent.childrenElem.insertBefore (children[i+1], this.elem);
                done = true;
                break;
            }
        if (!done)
            parent.childrenElem.insertBefore (children[0], this.elem);
    }
};

Collection.prototype.addChild = function (name) {
    if (Object.hasOwnProperty.call (this.children, name))
        return this.children[name];
    return this.children[name] = new Collection (
        this, 
        this.controller, 
        path.join (this.dirpath, name),
        name
    );
};
