
var gui = global.window.nwDispatcher.requireNwGui();

/**     @module/class PornViewer:Visualizer

*/
var CONTROLS_TIMEOUT = 1500;
var MODE_INDEX = { normal:0, zoom:1, flood:2 };
function Visualizer (controller) {
    this.controller = controller;
    this.isReady = false
    this.queue = [ ]; // stores callbacks until page is ready
    this.readyImages = {}; // images ready to display
    this.loadingImages = {};
    this.imageList = [];

    this.mode = window.localStorage.lastMode;
    if (!this.mode)
        this.mode = window.localStorage.lastMode = 'normal';

    // launch the Visualizer Window
    this.window = gui.Window.open ('./controller/Visualizer/index.html', {
        toolbar:        false,
        frame:          false,
        transparent:    true,
        title:          'PornViewer',
        icon:           'controller/icon.png'
    });
    controller.window.focus();

    var self = this;
    this.window.on ('loaded', function(){
        // civilize the natives
        var window = self.window.window;
        require ('scum') (window);
        self.document = window.document;

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
        self.document.getElementById ('Minimize').on ('click', function(){
            self.window.minimize();
        });
        self.dancer = self.document.getElementById ('Dancer');
        var maxElem = self.document.getElementById ('Maximize');
        maxElem.on ('click', function(){
            if (self.isMaximized)
                self.window.unmaximize();
            else
                self.window.maximize();
        });
        self.window.on ('maximize', function(){
            self.isMaximized = true;
            maxElem.addClass ('restore');
        });
        self.window.on ('unmaximize', function(){
            self.isMaximized = false;
            maxElem.dropClass ('restore');
        });
        self.window.on ('resize', function (width, height){
            self.canvas.width = self.canvas.clientWidth;
            self.canvas.height = self.canvas.clientHeight;
            self.redraw();
            self.isMaximized = false;
            maxElem.dropClass ('restore');
        });
        self.context = self.canvas.getContext('2d');
        self.context.fillStyle = 'white';
        self.modeSelect = self.document.getElementById ('Mode');
        self.modeSelect.selectedIndex = MODE_INDEX[self.mode];
        self.modeSelect.on ('change', function(){
            self.mode = self.modeSelect.value;
            self.redraw();
            self.modeSelect.blur();
            window.localStorage.lastMode = self.mode;
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
        var Theatre = self.document.getElementById ('Theatre');
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
        window.document.body.on ('mousemove', bumpControls);
        self.controlsElem.on ('mousemove', bumpControls);

        // mark ready and clear queue
        self.isReady = true;
        for (var i=0,j=self.queue.length; i<j; i++)
            self.queue[i].call (self);
        delete self.queue;
    });
}
module.exports = Visualizer;

Visualizer.prototype.display = function (filepath, type) {
    if (!filepath) return;

    if (!this.isReady) {
        this.queue.push (function(){ this.display (filepath, type); });
        return;
    }

    var self = this;
    this.loadImage (filepath, function (err, image) {
        self.activeImage = image;
        self.activeType = type;
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
