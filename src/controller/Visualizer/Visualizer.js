
var gui = global.window.nwDispatcher.requireNwGui();
var ChainCache = require ('cachew').ChainCache;

/**     @module/class PornViewer:Visualizer

*/
var CONTROLS_TIMEOUT = 1500;
function Visualizer (controller) {
    this.controller = controller;
    this.isReady = false
    this.queue = [ ]; // stores callbacks until page is ready
    this.readyImages = {}; // images ready to display
    this.loadingImages = {};
    this.imageList = [];

    this.mode = controller.window.localStorage.lastMode;
    if (!this.mode)
        this.mode = controller.window.localStorage.lastMode = 'normal';

    // launch the Visualizer Window
    this.window = gui.Window.open ('./controller/Visualizer/index.html', {
        // toolbar: false,
        // frame:   false
    });

    var self = this;
    this.window.on ('loaded', function(){
        // civilize the natives
        var window = self.window.window;
        require ('scum') (window);
        self.document = window.document;
        // self.window.showDevTools();

        // keyboard navigation events
        self.document.body.on ('keydown', function (event) {
            if (event.keyCode < 37 || event.keyCode > 40)
                return;
            self.controller.go (event.keyCode);
        });

        // set up our DOM presence
        self.controlsElem = self.document.getElementById ('Controls');
        self.canvas = self.document.getElementById ('Display');
        self.canvas.width = self.canvas.clientWidth;
        self.canvas.height = self.canvas.clientHeight;
        self.window.on ('resize', function(){
            self.canvas.width = self.canvas.clientWidth;
            self.canvas.height = self.canvas.clientHeight;
            self.redraw();
        });
        self.context = self.canvas.getContext('2d');
        self.modeSelect = self.document.getElementById ('Mode');
        self.modeSelect.on ('change', function(){
            self.mode = self.modeSelect.value;
            self.redraw();
        });
        self.closeElem = self.document.getElementById ('Close');
        self.closeElem.on ('click', function(){
            self.window.close (true);
            self.controller.window.close (true);
        });
        self.window.on ('close', function(){
            self.window.close (true);
            self.controller.window.close (true);
        });

        // bump controls into view whenever the mouse moves
        var controlsTimer;
        function bumpControls(){
            console.log ('move');
            clearTimeout (controlsTimer);
            self.controlsElem.addClass ('visible');
            controlsTimer = setTimeout (function(){
                self.controlsElem.dropClass ('visible');
            }, CONTROLS_TIMEOUT);
        }
        window.document.body.on ('mousemove', bumpControls);
        self.controlsElem.on ('mousemove', bumpControls);

        // mark ready and clear queue
        self.isReady = true;
        for (var i=0,j=self.queue.length; i<j; i++)
            self.queue.call (this);
        delete self.queue;
    });
}
module.exports = Visualizer;

Visualizer.prototype.display = function (filepath) {
    if (!filepath) return;

    if (!this.isReady) {
        this.queue.push (function(){ this.display (filepath); });
        return;
    }

    var self = this;
    this.loadImage (filepath, function (err, image) {
        self.activeImage = image;
        self.redraw();
    });
};

Visualizer.prototype.preload = function (filepath) {
    if (!filepath) return;

    if (!this.isReady) {
        this.queue.push (function(){ this.preload (filepath); });
        return;
    }

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
        console.log (imageObj);
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
        console.log (err);
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

    var canvasWidth = this.canvas.width;
    var canvasHeight = this.canvas.height;
    this.context.clearRect (0, 0, canvasWidth, canvasHeight);

    if (this.mode == 'normal') {
        var width = this.activeImage.width;
        var height = this.activeImage.height;
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
        console.log (this.activeImage.width, this.activeImage.height, canvasWidth, canvasHeight);
        console.log (left, top, width, height);
        this.context.drawImage (this.activeImage, left, top, width, height);
        return;
    }

    var width = this.activeImage.width;
    var height = this.activeImage.height;
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

    this.context.drawImage (this.activeImage, left, top, width, height);
};
