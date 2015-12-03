
var path = require ('path');
// var VideoManager = require ('./VideoManager');
var chimera = require ('wcjs-renderer');

/**     @module/class PornViewer:Visualizer

*/
var MODE_INDEX = { normal:0, zoom:1, flood:2 };
var IMAGE_EXT = [ '.jpg', '.jpeg', '.png', '.gif' ];
var RE_LEFT = /left:(-?\d+)px/;
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
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.document.getElementById ('Minimize').on ('click', function(){
        self.window.minimize();
    });
    this.dancer = this.document.getElementById ('Dancer');
    this.vlcElem = this.document.getElementById ('VLC');
    this.videoContainer = this.document.getElementById ('VideoContainer');

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

    this.initialResizeClip = 100; // limit the initially rapid resize watchdog poll
    function resize (event) {
        if (self.canvas.width != self.canvas.clientWidth
         || self.canvas.height != self.canvas.clientHeight
        ) {
            self.canvas.width = self.canvas.clientWidth;
            self.canvas.height = self.canvas.clientHeight;
            self.redraw();

            // handle interval timing
            if ( initialInterval && ( !event || !--self.initialResizeClip ) ) {
                clearInterval (initialInterval);
                initialInterval = undefined;
                delete initialInterval;
                setInterval (resize, 5000);
            }
        }
        if (self.vlc) {
            var videoCanvas = self.document.getElementById ('VideoCanvas');
            var canvasHeight = videoCanvas.getAttribute ('height');
            if (!canvasHeight)
                return;
            var VideoContainer = self.document.getElementById ('VideoContainer');
            var containerHeight = VideoContainer.clientHeight;
            var canvasWidth = videoCanvas.getAttribute ('width');
            var containerWidth = VideoContainer.clientWidth;
            var wideRatio = containerWidth / canvasWidth;
            var tallRatio = containerHeight / canvasHeight;
            var useRatio = wideRatio < tallRatio ? wideRatio : tallRatio;
            var useHeight = Math.floor (canvasHeight * useRatio);
            videoCanvas.setAttribute (
                'style',
                'width:' + Math.floor (canvasWidth * useRatio) + 'px;'
              + 'height:' + useHeight + 'px;'
              + 'margin-top:' + Math.max (0, Math.floor((containerHeight - useHeight) / 2)) + 'px;'
            );
        }
    }

    // when the window first resizes at startup, the resize event isn't sent. We have to poll.
    var initialInterval = setInterval (resize, 100);
    this.window.on ('resize', resize);
    this.resize = resize;
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

    // video controls
    var PlayButton = this.document.getElementById ('PlayPause');
    var SeekBar = this.SeekBar = this.document.getElementById ('SeekBar');
    var SeekCaret = this.SeekCaret = this.document.getElementById ('SeekCaret');
    var MuteIndicator = this.document.getElementById ('MuteIndicator');
    var VolumeBar = this.document.getElementById ('VolumeBar');
    var VolumeCaret = this.document.getElementById ('VolumeCaret');
    var playing = false;

    var VideoControls = this.document.getElementById ('VideoControls');
    VideoControls.on ('mousedown', function(){ return false; })
    VideoControls.on ('selectstart', function(){ return false; })

    PlayButton.on ('click', function(){
        if (this.hasClass ('playing')) {
            this.dropClass ('playing');
            self.vlc.pause();
        } else {
            this.addClass ('playing');
            self.vlc.play();
        }
    });

    var seekDragging = false;
    SeekBar.on ('mousedown', function (event) {
        if (!self.vlc)
            return;
        if (!self.vlc.length)
            return false;
        seekDragging = true;
        var position = event.layerX / this.clientWidth;
        self.vlc.time = self.vlc.length * position;
        SeekCaret.setAttribute ('style', 'left:' + (position * this.clientWidth) + 'px;');
        return false;
    });
    SeekCaret.on ('mousedown', function (event) {
        event.stopPropagation();
        if (!self.vlc)
            return false;
        seekDragging = true;
        return false;
    });
    SeekBar.on ('dragstart', function (event) {
        if (!self.vlc)
            return false;
        seekDragging = false;
        event.preventDefault();
        event.stopPropagation();
        return false;
    });
    SeekBar.on ('mousemove', function (event) {
        if (!self.vlc)
            return false;
        if (!seekDragging || !event.movementX)
            return false;
        var position = Number (RE_LEFT.exec (SeekCaret.getAttribute ('style'))[1]);
        if (!position && event.movementX < 0)
            return false;
        var newPosition = position + event.movementX;
        if (newPosition >= (SeekBar.clientWidth - SeekCaret.firstChild.clientWidth))
            return false;
        SeekCaret.setAttribute ('style', 'left:' + newPosition + 'px;');
        self.vlc.time += Math.floor ((self.vlc.length / SeekBar.clientWidth) * event.movementX);
        return false;
    });
    SeekBar.on ('mouseenter', function (event) {
        if (!self.vlc)
            return false;
        if (!seekDragging)
            return;
        var position = event.layerX / SeekBar.clientWidth;
        self.vlc.time = self.vlc.length * position;
    });

    var volumeDragging = false;
    var stashedVolume = 100;
    MuteIndicator.on ('click', function (event) {
        if (!self.vlc)
            return false;
        if (self.vlc.audio.volume) {
            stashedVolume = self.vlc.audio.volume;
            self.vlc.audio.volume = 0;
            this.setAttribute ('src', 'muted.png');
            VolumeCaret.setAttribute (
                'style',
                'left:' + (-1 * VolumeBar.offsetWidth) + 'px;'
            );
        } else {
            self.vlc.audio.volume = stashedVolume;
            this.setAttribute ('src', 'mute.png');
            VolumeCaret.setAttribute (
                'style',
                'left:' + Math.floor (((stashedVolume / 100) * VolumeBar.offsetWidth) - VolumeBar.offsetWidth) + 'px;'
            );
        }
    });
    VolumeBar.on ('mousedown', function (event) {
        if (!self.vlc)
            return false;
        volumeDragging = true;
        var position = event.layerX / this.offsetWidth;
        var rough = self.vlc.audio.volume = Math.floor (100 * position);
        rough /= 100;
        VolumeCaret.setAttribute (
            'style',
            'left:' + (Math.floor (rough * this.offsetWidth) - this.offsetWidth) + 'px;'
        );
        if (!position)
            MuteIndicator.setAttribute ('src', 'muted.png');
        else
            MuteIndicator.setAttribute ('src', 'mute.png');
    });
    VolumeCaret.on ('mousedown', function (event) {
        event.stopPropagation();
        if (!self.vlc)
            return false;
        volumeDragging = true;
        return false;
    });
    VolumeBar.on ('dragstart', function (event) {
        if (!self.vlc)
            return false;
        volumeDragging = false;
        event.preventDefault();
        event.stopPropagation();
        return false;
    });
    VolumeBar.on ('mousemove', function (event) {
        if (!self.vlc)
            return false;
        if (!volumeDragging || !event.movementX)
            return false;
        var position =
            VolumeBar.offsetWidth
          + Number (RE_LEFT.exec (VolumeCaret.getAttribute ('style'))[1])
          ;
        if (!position && event.movementX < 0)
            return false;
        var range = VolumeBar.offsetWidth - VolumeCaret.clientWidth;
        var newPosition = Math.max (0, position + event.movementX);
        if (newPosition >= range)
            return false;
        VolumeCaret.setAttribute ('style', 'left:' + (newPosition - VolumeBar.offsetWidth) + 'px;');
        self.vlc.audio.volume = Math.floor (100 * newPosition / range);
        if (!newPosition)
            MuteIndicator.setAttribute ('src', 'muted.png');
        else
            MuteIndicator.setAttribute ('src', 'mute.png');
        return false;
    });
    VolumeBar.on ('mouseenter', function (event) {
        if (!self.vlc)
            return false;
        if (!volumeDragging)
            return;
        var position = event.layerX / VolumeBar.offsetWidth;
        VolumeCaret.setAttribute (
            'style',
            'left:' + ((position * VolumeBar.offsetWidth) - VolumeBar.offsetWidth) + 'px;'
        );
        self.vlc.audio.volume = Math.floor (100 * position);
    });
    VolumeCaret.setAttribute (
        'style',
        // 'left:' + Math.floor (((self.vlc.audio.volume / 100) * VolumeBar.offsetWidth) - VolumeBar.offsetWidth) + 'px'
        'left:0px'
    );

    function killDrags (event) {
        seekDragging = false;
        volumeDragging = false;
        setTimeout (function(){
            seekWasDragging = false;
            volumeWasDragging = false;
        }, 50);
    }
    this.document.body.on ('mouseup', killDrags);
    this.document.body.on ('mouseleave', killDrags);
}
module.exports = Visualizer;

Visualizer.prototype.playpause = function(){
    if (!this.vlc)
        return;
    if (this.vlc.playing)
        this.vlc.pause();
    else
        this.vlc.play();
};

Visualizer.prototype.jump = function (timeShift) {
    if (!this.vlc || !this.vlc.length)
        return;
    var newTime = this.vlc.time = Math.max (0, Math.min (this.vlc.length, this.vlc.time + timeShift));

    // adjust the caret
    var position = newTime / this.vlc.length;
    this.SeekCaret.setAttribute ('style', 'left:' + (position * this.SeekBar.clientWidth) + 'px;');
};

Visualizer.prototype.display = function (filepath, type) {
    if (!filepath) return;
    if (this.vlc) {
        this.vlc.stop();
        delete this.vlc;
        this.vlcElem.dropClass ('active');
    }

    // video?
    var isVideo = true;
    for (var i=0,j=IMAGE_EXT.length; i<j; i++) {
        var ext = IMAGE_EXT[i];
        if (filepath.slice (-1 * ext.length) === ext) {
            isVideo = false;
            break;
        }
    }

    var self = this;

    if (isVideo) {
        if (this.dancer.firstChild) {
            this.dancer.firstChild.dispose();
            this.dancer.removeAttribute ('style');
        }
        this.context.clearRect (0, 0, this.canvas.width, this.canvas.height);
        this.controlsElem.dropClass ('image');
        this.controlsElem.addClass ('video');
        this.vlcElem.addClass ('active');

        this.vlcElem.innerHTML = '<div id="VideoContainer"><canvas id="VideoCanvas" /></div>';
        var container = this.document.getElementById ('VideoContainer');
        var canvas = this.document.getElementById ('VideoCanvas');

        this.vlc = chimera.init (canvas);
        this.vlc.play ('file:///' + filepath);

        this.vlc.events.once ('FrameReady', function (frame) {
            var canvasWidth = frame.width;
            var canvasHeight = frame.height;
            canvas.setAttribute ('width', canvasWidth);
            canvas.setAttribute ('height', canvasHeight);
            var containerHeight = container.clientHeight;
            var containerWidth = container.clientWidth;
            var wideRatio = containerWidth / canvasWidth;
            var tallRatio = containerHeight / canvasHeight;
            var useRatio = wideRatio < tallRatio ? wideRatio : tallRatio;
            var useHeight = Math.floor (canvasHeight * useRatio);
            canvas.setAttribute (
                'style',
                'width:' + Math.floor (canvasWidth * useRatio) + 'px;'
              + 'height:' + useHeight + 'px;'
              + 'margin-top:' + Math.max (0, Math.floor((containerHeight - useHeight) / 2)) + 'px;'
            );
        });

        // this.vlc = VideoManager (this.vlcElem, filepath);
        var SeekBar = this.document.getElementById ('SeekBar');
        var SeekCaret = this.document.getElementById ('SeekCaret');
        var isPlayingTimeout;
        this.vlc.onTimeChanged = function (time) {
            clearTimeout (isPlayingTimeout);
            isPlayingTimeout = setTimeout (function(){
                if (self.vlc.playing)
                    PlayButton.addClass ('playing');
                else
                    PlayButton.dropClass ('playing');
            }, 300);
            var maxOffset = SeekBar.clientWidth - SeekCaret.firstChild.clientWidth;
            SeekCaret.setAttribute (
                'style',
                'left:' + Math.floor (maxOffset * (time / self.vlc.length)) + 'px'
            );
        };
        var PlayButton = this.document.getElementById ('PlayPause');
        this.vlc.onPlaying = function(){
            PlayButton.addClass ('playing');
        };

        this.vlc.onPaused = function(){
            PlayButton.dropClass ('playing');
        };

        this.vlc.onStopped = function(){
            PlayButton.dropClass ('playing');
        };
        return;
    }

    // file is an image
    this.loadImage (filepath, function (err, image) {
        self.controlsElem.dropClass ('video');
        self.controlsElem.addClass ('image');
        self.activePath = filepath;
        self.activeImage = image;
        self.activeType = type;
        self.redraw();
    });
};

Visualizer.prototype.preload = function (filepath) {
    if (!filepath) return;

    var isVideo = true;
    for (var i=0,j=IMAGE_EXT.length; i<j; i++) {
        var ext = IMAGE_EXT[i];
        if (filepath.slice (-1 * ext.length) === ext) {
            isVideo = false;
            break;
        }
    }
    if (isVideo)
        return;

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

    // join the queue of an image that's already loading
    var self = this;
    if (Object.hasOwnProperty.call (this.loadingImages, filepath)) {
        if (callback)
            this.loadingImages[filepath].push (callback);
        return;
    }

    // start an image loading job
    if (callback)
        this.loadingImages[filepath] = [ callback ];
    else
        this.loadingImages[filepath] = [ ];
    var imageObj = this.document.createElement ('img');
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

    var width = Math.floor (this.activeImage.width);
    var height = Math.floor (this.activeImage.height);
    var canvasWidth = this.canvas.width;
    var canvasHeight = this.canvas.height;

    if (this.dancer.firstChild) {
        this.dancer.firstChild.dispose();
        this.dancer.removeAttribute ('style');
    }
    this.context.clearRect (0, 0, canvasWidth, canvasHeight);

    // normal mode
    if (this.mode == 'normal') {
        var wideRatio = canvasWidth / width;
        var tallRatio = canvasHeight / height;
        if (wideRatio < 1 || tallRatio < 1) {
            if (wideRatio < tallRatio) {
                width = Math.floor (width * wideRatio);
                height = Math.floor (height * wideRatio);
            } else {
                width = Math.floor (width * tallRatio);
                height = Math.floor (height * tallRatio);
            }
        }
        var top = Math.floor (( canvasHeight - height ) / 2);
        var left = Math.floor (( canvasWidth - width ) / 2);

        if (this.activeType != 'gif' && this.activePath.slice (-4) != '.gif') {
            this.context.fillRect (left, top, width, height);
            this.context.drawImage (this.activeImage, left, top, width, height);
        } else {
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
    if (this.activeType != 'gif' && this.activePath.slice (-4) != '.gif')
        this.context.drawImage (this.activeImage, left, top, width, height);
    else {
        this.dancer.setAttribute (
            'style',
            'top:'+top+'px;left:'+left+'px;width:'+width+'px;height:'+height+'px;'
        );
        this.dancer.appendChild (this.activeImage);
    }
};
