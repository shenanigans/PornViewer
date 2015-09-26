
var path = require ('path');

/**     @module/class PornViewer:Visualizer

*/
var CONTROLS_TIMEOUT = 1500;
var MODE_INDEX = { normal:0, zoom:1, flood:2 };
function Visualizer (winnder, console) {
    this.window = winnder;
    this.document = winnder.window.document;
    this.console = console;

    this.readyImages = {}; // images ready to display
    this.loadingImages = {};
    this.imageList = [];

    this.mode = window.localStorage.lastMode;
    if (!this.mode)
        this.mode = window.localStorage.lastMode = 'normal';

    var self = this;

    // set up our DOM presence
    this.controlsElem = this.document.getElementById ('Controls');
    this.canvas = this.document.getElementById ('Display');
    this.console.log (this.document.body);
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.document.getElementById ('Minimize').on ('click', function(){
        self.console.log ('from Visualizer');
        self.window.minimize();
    });
    this.dancer = this.document.getElementById ('Dancer');
    var maxElem = this.document.getElementById ('Maximize');
    maxElem.on ('click', function(){
        if (self.isMaximized)
            self.window.unmaximize();
        else
            self.window.maximize();
    });
    this.window.on ('maximize', function(){
        self.isMaximized = true;
        maxElem.addClass ('restore');
    });
    this.window.on ('unmaximize', function(){
        self.isMaximized = false;
        maxElem.dropClass ('restore');
    });
    this.window.on ('resize', function (width, height){
        self.canvas.width = self.canvas.clientWidth;
        self.canvas.height = self.canvas.clientHeight;
        self.redraw();
        self.isMaximized = false;
        maxElem.dropClass ('restore');
    });
    this.context = this.canvas.getContext('2d');
    this.context.fillStyle = 'white';
    this.modeSelect = this.document.getElementById ('Mode');
    this.modeSelect.selectedIndex = MODE_INDEX[this.mode];
    this.modeSelect.on ('change', function(){
        self.mode = self.modeSelect.value;
        self.redraw();
        self.modeSelect.blur();
        window.localStorage.lastMode = self.mode;
    });
    this.closeElem = this.document.getElementById ('Close');
    this.closeElem.on ('click', function(){
        self.window.close();
    });

    // bump controls into view whenever the mouse moves
    var controlsTimer;
    var Theatre = this.document.getElementById ('Theatre');
    function bumpControls(){
        clearTimeout (controlsTimer);
        self.controlsElem.addClass ('visible');
        Theatre.dropClass ('nocurse');
        controlsTimer = setTimeout (function(){
            self.controlsElem.dropClass ('visible');
            Theatre.addClass ('nocurse');
            self.modeSelect.blur();
        }, CONTROLS_TIMEOUT);
    }
    this.document.body.on ('mousemove', bumpControls);
    this.controlsElem.on ('mousemove', bumpControls);
}
module.exports = Visualizer;

Visualizer.prototype.display = function (filepath, type) {
    if (!filepath) return;

    var self = this;
    this.loadImage (filepath, function (err, image) {
        self.activeImage = image;
        self.activeType = type;
        self.redraw();
    });
};

Visualizer.prototype.preload = function (filepath) {
    if (!filepath) return;

    var self = this;
    this.loadImage (filepath);
};

var MAX_PRELOAD = 10;
Visualizer.prototype.loadImage = function (filepath, callback) {
    // use a preloaded image
    if (Object.hasOwnProperty.call (this.readyImages, filepath)) {
        if (callback) {
            var currentI = this.imageList.indexOf (filepath);
            this.imageList.splice (currentI, 1);
            this.imageList.push (filepath);
            callback (undefined, this.readyImages[filepath]);
        }
        return;
    }

    // join the queue of a loading image
    var self = this;
    if (Object.hasOwnProperty.call (this.loadingImages, filepath)) {
        if (callback)
            this.loadingImages[filepath].push (callback);
        return;
    }

    // load the image
    if (callback)
        this.loadingImages[filepath] = [ callback ];
    else
        this.loadingImages[filepath] = [ ];
    var imageObj = new this.window.window.Image();
    imageObj.onload = function(){
        self.readyImages[filepath] = imageObj;
        self.imageList.push (filepath);
        if (self.imageList.length > MAX_PRELOAD)
            delete self.readyImages[self.imageList.shift()];
        var queue = self.loadingImages[filepath];
        delete self.loadingImages[filepath];
        for (var i=0,j=queue.length; i<j; i++)
            queue[i] (undefined, imageObj);
    };
    imageObj.onerror = function (err) {
        var queue = self.loadingImages[filepath];
        delete self.loadingImages[filepath];
        for (var i=0,j=queue.length; i<j; i++)
            queue[i] (err);
    };
    imageObj.src = 'file://' + filepath;
};

Visualizer.prototype.redraw = function(){
    if (!this.activeImage)
        return;

    var width = this.activeImage.width;
    var height = this.activeImage.height;
    var canvasWidth = this.canvas.width;
    var canvasHeight = this.canvas.height;
    if (this.dancer.firstChild)
        this.dancer.firstChild.dispose();
    this.context.clearRect (0, 0, canvasWidth, canvasHeight);

    if (this.mode == 'normal') {
        if (width > canvasWidth) {
            var coef = canvasWidth / width;
            width = canvasWidth;
            height = Math.round (height * coef);
        }
        if (height > canvasHeight) {
            var coef = canvasHeight / height;
            height = canvasHeight;
            width = Math.round (width * coef);
        }

        var top = Math.floor (( canvasHeight - height ) / 2);
        var left = Math.floor (( canvasWidth - width ) / 2);
        this.context.fillRect (left, top, width, height);
        if (this.activeType != 'gif')
            this.context.drawImage (this.activeImage, left, top, width, height);
        else {
            this.dancer.setAttribute (
                'style',
                'top:'+top+'px;left:'+left+'px;width:'+width+'px;height:'+height+'px;'
            );
            this.dancer.appendChild (this.activeImage);
        }
        return;
    }

    // zoom and flood modes
    var wideRatio = canvasWidth / width;
    var tallRatio = canvasHeight / height;
    if (wideRatio > tallRatio) {
        width *= tallRatio;
        height *= tallRatio;
    } else if (wideRatio < tallRatio) {
        width *= wideRatio;
        height *= wideRatio;
    } else {
        width *= wideRatio;
        height *= wideRatio;
    }

    if (this.mode == 'flood') {
        width *= 1.2;
        height *= 1.2;
    }

    var top = Math.floor (( canvasHeight - height ) / 2);
    var left = Math.floor (( canvasWidth - width ) / 2);
    this.context.fillRect (left, top, width, height);
    if (this.activeType != 'gif')
        this.context.drawImage (this.activeImage, left, top, width, height);
    else {
        this.dancer.setAttribute (
            'style',
            'top:'+top+'px;left:'+left+'px;width:'+width+'px;height:'+height+'px;'
        );
        this.dancer.appendChild (this.activeImage);
    }
    this.context.drawImage (this.activeImage, left, top, width, height);
};
