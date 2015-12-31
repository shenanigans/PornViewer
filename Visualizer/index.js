
var path = require ('path');
// var VideoManager = require ('./VideoManager');
var chimera = require ('wcjs-renderer');

/**     @module/class PornViewer:Visualizer

*/
var MODE_INDEX = { normal:0, zoom:1, flood:2 };
var IMAGE_EXT = [ '.jpg', '.jpeg', '.png', '.gif' ];
var RE_LEFT = /left:(-?\d+)px/;
var MIN_WIDTH = 10;
var MIN_HEIGHT = 10;
var MIN_SHOWING = 5;
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

    // manual image viewing
    this.document.body.on ('wheel', function (event) {
        var shift = event.wheelDelta / 2000;
        self.zoomRatio += self.zoomRatio * shift;
        self.manualZoom = true;
        self.redraw();
    });
    this.imageDragging = false;
    this.manualOffset = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.document.on ('mousedown', function (event) {
        if (event.button != 0)
            return;
        self.document.body.addClass ('draggingImage');
        self.imageDragging = true;
    });
    this.document.body.on ('mouseup', function(){
        self.document.body.dropClass ('draggingImage');
        self.imageDragging = false;
    });
    this.document.body.on ('mouseleave', function(){
        self.document.body.dropClass ('draggingImage');
        self.imageDragging = false;
    });
    this.document.body.on ('mousemove', function (event) {
        if (!self.imageDragging) return;
        self.maxOffset = true;
        self.offsetX += event.movementX;
        self.offsetY += event.movementY;
        self.redraw();
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
    }

    // when the window first resizes at startup, the resize event isn't sent. We have to poll.
    var initialInterval = setInterval (resize, 100);
    this.window.on ('resize', resize);
    this.resize = resize;

    this.context = this.canvas.getContext('2d');
    this.context.fillStyle = 'white';

    // basic view controls
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

    this.useCustom = this.document.getElementById ('UseCustom');
    this.usingCustomViews = Boolean (this.useCustom.checked);
    this.useCustom.on ('change', function(){
        self.usingCustomViews = Boolean (self.useCustom.checked);
        if (!self.activePron)
            return;
        if (self.usingCustomViews) {
            // copy view settings from active Pron
            if (self.activePron.extra.X)
                self.offsetX = self.activePron.extra.X;
            if (self.activePron.extra.Y)
                self.offsetY = self.activePron.extra.Y;
            if (self.activePron.extra.zoom) {
                self.zoomRatio = self.activePron.extra.zoom;
                self.manualZoom = true;
            }
        } else {
            // set view settings to default
            self.offsetX = 0;
            self.offsetY = 0;
            self.manualZoom = false;
        }
        self.redraw();
    });

    // video controls
    this.vlcElem = this.document.getElementById ('VLC');
    this.vlcCanvas = this.document.getElementById ('VideoCanvas');
    this.vlcContainer = this.document.getElementById ('VideoContainer');
    var PlayButton = this.document.getElementById ('PlayPause');
    var SeekBar = this.seekBar = this.document.getElementById ('SeekBar');
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

        var position = (event.screenX - this.getBoundingClientRect().left) / this.clientWidth;
        self.vlc.time = self.vlc.length * position;
        SeekCaret.setAttribute ('style', 'left:' + Math.floor (position * this.clientWidth) + 'px;');
        return false;
    });
    SeekCaret.on ('mousedown', function (event) {
        if (event.target !== SeekCaret)
            return;
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
        'left:0px'
    );

    function killDrags(){
        seekDragging = false;
        volumeDragging = false;
    }
    this.document.body.on ('mouseup', killDrags);
    this.document.body.on ('mouseleave', killDrags);

    // context menu setup and display
    this.contextMenu = this.document.getElementById ('ContextMenu');
    this.contextMenu.on ('mousedown', function (event) { event.stopPropagation(); return false; });
    this.contextMenu.on ('selectstart', function(){ return false; });
    this.videoMenuSection = this.document.getElementById ('CX_Options_Video');

    var audioSectionButton = this.document.getElementById ('CX_Options_Audio');
    var subtitleSectionButton = this.document.getElementById ('CX_Options_Subtitles');
    this.audioTrackButtons = audioSectionButton.lastElementChild;
    this.audioTrackButtons.on ('mousedown', function (event) {
        event.stopPropagation();
    });
    this.subtitleTrackButtons = subtitleSectionButton.lastElementChild;
    this.subtitleTrackButtons.on ('mousedown', function (event) {
        event.stopPropagation();
    });
    audioSectionButton.on ('click', function(){
        if (!self.vlc || !self.audioTrackButtons.children.length)
            return;
        if (audioSectionButton.hasClass ('open'))
            audioSectionButton.dropClass ('open');
        else
            audioSectionButton.addClass ('open');
    });
    subtitleSectionButton.on ('click', function(){
        if (!self.vlc || !self.subtitleTrackButtons.children.length)
            return;
        if (subtitleSectionButton.hasClass ('open'))
            subtitleSectionButton.dropClass ('open');
        else
            subtitleSectionButton.addClass ('open');
    });
    this.document.body.on ('mousedown', function (event) {
        if (event.button != 2) {
            self.contextMenu.dropClass ('active');
            return;
        }

        self.setupContextMenu();

        // clientX, clientY
        var left = event.clientX;
        var top = event.clientY;
        if (left + self.contextMenu.clientWidth > self.window.window.innerWidth)
            left -= self.contextMenu.clientWidth;
        if (top + self.contextMenu.clientHeight > self.window.window.innerHeight)
            top -= self.contextMenu.clientHeight;
        self.contextMenu.setAttribute ('style', 'left:'+left+'px;top:'+top+'px;');
        self.contextMenu.addClass ('active');
    });

    // context menu buttons
    var resetViewButton = this.document.getElementById ('CX_Options_Reset');
    resetViewButton.on ('click', function(){
        self.contextMenu.dropClass ('active');
        self.offsetX = 0;
        self.offsetY = 0;
        self.manualZoom = false;
        self.redraw();
        self.manualZoom = true;
    });
    var resetVideoButton = this.document.getElementById ('CX_Options_Video_Reset');
    resetVideoButton.on ('click', function(){
        self.contextMenu.dropClass ('active');
        self.videoStart = 0;
        self.videoEnd = self.vlc.length;
        delete self.activePron.extra.skip;
        self.redraw();
    });
}
module.exports = Visualizer;

Visualizer.prototype.setupContextMenu = function(){
    var self = this;
    if (!this.vlc)
        this.videoMenuSection.dropClass ('active');
    else {
        this.videoMenuSection.addClass ('active');
        if (!this.vlc.audio) {
            console.log ('NO AUDIO');
            // update when video is loaded
            this.vlc.events.once ('FrameReady', function(){

            });
        } else {
            this.audioTrackButtons.disposeChildren();
            var trackNum = this.vlc.audio.track;
            if (trackNum < 0)
                trackNum = 0;
            for (var i=0,j=this.vlc.audio.count; i<j; i++) {
                var trackButton = this.document.createElement ('div');
                trackButton.className = trackNum == i ? 'CX_Option active' : 'CX_Option';
                trackButton.setAttribute ('data-index', i);
                trackButton.on ('click', function (event) {
                    event.stopPropagation();
                    self.vlc.audio.track = Number (this.getAttribute ('data-index'));
                    for (var i=0,j=this.parentNode.children.length; i<j; i++)
                        if (this.parentNode.children[i].hasClass ('active')) {
                            this.parentNode.children[i].dropClass ('active');
                            break;
                        }
                    this.addClass ('active');
                    return false;
                });
                trackButton.textContent = this.vlc.audio[i];
                this.audioTrackButtons.appendChild (trackButton);
            }
            this.subtitleTrackButtons.disposeChildren();
            var subNum = this.vlc.subtitles.track;
            if (subNum < 0)
                subNum = 0;
            for (var i=0,j=this.vlc.subtitles.count; i<j; i++) {
                var trackButton = this.document.createElement ('div');
                trackButton.className = trackNum == i ? 'CX_Option active' : 'CX_Option';
                trackButton.setAttribute ('data-index', i);
                trackButton.on ('click', function (event) {
                    event.stopPropagation();
                    self.vlc.subtitles.track = Number (this.getAttribute ('data-index'));
                    for (var i=0,j=this.parentNode.children.length; i<j; i++)
                        if (this.parentNode.children[i].hasClass ('active')) {
                            this.parentNode.children[i].dropClass ('active');
                            break;
                        }
                    this.addClass ('active');
                    return false;
                });
                trackButton.textContent = this.vlc.subtitles[i];
                this.subtitleTrackButtons.appendChild (trackButton);
            }
        }
    }
};

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
    this.SeekCaret.setAttribute ('style', 'left:' + (position * this.seekBar.clientWidth) + 'px;');
};

var SEEK_TIME_HYSTERESIS = 7;
Visualizer.prototype.display = function (prawn) {
    if (this.vlc) {
        this.vlc.stop();
        delete this.vlc;
        this.vlcElem.dropClass ('active');
    }

    var self = this;

    if (this.activePron) {
        // save any custom view info to disk
        if (this.offsetX)
            this.activePron.extra.X = this.offsetX;
        if (this.offsetY)
            this.activePron.extra.Y = this.offsetY;
        if (this.manualZoom || this.offsetX || this.offsetY)
            this.activePron.extra.zoom = this.zoomRatio;
        if (this.videoStart)
            this.activePron.extra.start = this.videoStart;
        if (this.videoEnd)
            this.activePron.extra.end = this.videoEnd;
        this.activePron.saveExtra();
    }

    this.manualZoom = false;
    this.offsetX = 0;
    this.offsetY = 0;
    this.activePron = prawn;
    if (this.usingCustomViews) {
        if (prawn.extra.X)
            this.offsetX = prawn.extra.X;
        if (prawn.extra.Y)
            this.offsetY = prawn.extra.Y;
        if (prawn.extra.zoom) {
            this.zoomRatio = prawn.extra.zoom;
            this.manualZoom = true;
        }
    }

    if (prawn.isImage) {
        this.loadImage (prawn.fullpath, function (err, image) {
            if (err) {
                console.log ('loadImage error', err);
                return;
            }
            if (self.activePron !== prawn) // not interested in this Pron anymore
                return;
            self.setupContextMenu();
            self.controlsElem.dropClass ('video');
            self.controlsElem.addClass ('image');
            self.activeImage = image;
            self.redraw();
        });
        return;
    }

    // video
    if (this.dancer.firstChild) {
        this.dancer.firstChild.dispose();
        this.dancer.removeAttribute ('style');
    }
    this.context.clearRect (0, 0, this.canvas.width, this.canvas.height);
    this.controlsElem.dropClass ('image');
    this.controlsElem.addClass ('video');
    this.vlcElem.addClass ('active');
    delete this.activeImage;

    var currentVLC = this.vlc = chimera.init (this.vlcCanvas);
    this.vlc.play ('file:///' + prawn.fullpath);

    this.vlc.events.once ('FrameReady', function (frame) {
        self.vlcCanvas.setAttribute ('width', frame.width);
        self.vlcCanvas.setAttribute ('height', frame.height);
        self.redraw();
        self.setupContextMenu();
    });

    var SeekCaret = this.document.getElementById ('SeekCaret');
    var SeekTime = this.document.getElementById ('SeekTime');
    var isPlayingTimeout;
    this.vlc.onTimeChanged = function (time) {
        if (self.vlc !== currentVLC)
            return;
        SeekTime.textContent = toTimeStr (time);
        clearTimeout (isPlayingTimeout);
        isPlayingTimeout = setTimeout (function(){
            if (self.vlc !== currentVLC)
                return;
            if (self.vlc.playing)
                PlayButton.addClass ('playing');
            else
                PlayButton.dropClass ('playing');
        }, 300);
        var maxOffset = self.seekBar.clientWidth - SeekCaret.firstChild.clientWidth;
        SeekCaret.setAttribute (
            'style',
            'left:' + Math.floor (maxOffset * (time / self.vlc.length)) + 'px'
        );

        var seekRect = self.seekBar.getBoundingClientRect();
        var caretRect = SeekCaret.getBoundingClientRect();
        var rightEdge = caretRect.right + SeekTime.clientWidth;
        if (rightEdge > seekRect.right)
            SeekTime.addClass ('left');
        else if (seekRect.right - rightEdge > SEEK_TIME_HYSTERESIS)
            SeekTime.dropClass ('left');
    };
    var PlayButton = this.document.getElementById ('PlayPause');
    this.vlc.onPlaying = function(){
        if (self.vlc !== currentVLC)
            return;
        PlayButton.addClass ('playing');
    };

    this.vlc.onPaused = function(){
        if (self.vlc !== currentVLC)
            return;
        PlayButton.dropClass ('playing');
    };

    this.vlc.onStopped = function(){
        if (self.vlc !== currentVLC)
            return;
        PlayButton.dropClass ('playing');
    };

    // playback start / stop / skip

};

var MINUTE = 1000 * 60;
var HOUR = MINUTE * 60;
function toTimeStr (mils) {
    var hours = Math.floor (mils / HOUR);
    var minutes = Math.floor ((mils % HOUR) / MINUTE);
    var seconds = Math.floor ((mils % MINUTE) / 1000);
    var str = '';
    if (hours)
        str += hours + ':';
    str += hours ? minutes < 10 ? '0' + minutes : minutes : minutes;
    str += ':' + (seconds < 10 ? '0' + seconds : seconds);
    return str;
}

Visualizer.prototype.setStartTime = function(){
    this.activePron.extra.start = this.vlc.time;
    var startBlock = this.document.createElement ('div');
    startBlock.setAttribute ('id', 'StartBlock');
    var timeSpan = this.document.createElement ('span');
    timeSpan.textContent = toTimeStr (this.vlc.time);
    startBlock.appendChild (timeSpan);
    startBlock.appendChild (this.document.createElement ('div'));
    var handle = this.document.createElement ('div');
    handle.className = 'seekHandle';
    handle.setAttribute ('id', 'FirstHandle');
    startBlock.appendChild (handle);

    // mouse enter/leave events make it easier to grab the handles
    var startTimeout;
    startBlock.on ('mouseenter', function(){
        if (self.imageDragging || seekDragging || volumeDragging)
            return;
        clearTimeout (startTimeout);
        if (startBlock.hasClass ('showHandles'))
            return;
        for (var i=0,j=self.seekBar.children.length; i<j; i++)
            self.seekBar.children[i].dropClass ('showHandles');
        startBlock.addClass ('showHandles');
    });
    startBlock.on ('mouseleave', function(){
        startTimeout = setTimeout (function(){
            startBlock.dropClass ('showHandles');
        }, 1200);
    });

    // drag the handle to adjust the start time
    var dragging = false;
    handle.on ('mousedown', function(){
        dragging = true;
    });
    handle.on ('mouseup', function(){
        dragging = false;
    });
};

Visualizer.prototype.setEndTime = function(){
    this.activePron.extra.start = this.vlc.time;
    var endBlock = this.document.createElement ('div');
    endBlock.setAttribute ('id', 'EndBlock');
    var timeSpan = this.document.createElement ('span');
    timeSpan.textContent = toTimeStr (this.vlc.time);
    endBlock.appendChild (timeSpan);
    endBlock.appendChild (this.document.createElement ('div'));
    var handle = this.document.createElement ('div');
    handle.className = 'seekHandle';
    handle.setAttribute ('id', 'FirstHandle');
    endBlock.appendChild (handle);

    // mouse enter/leave events make it easier to grab the handles
    var endTimeout;
    endBlock.on ('mouseenter', function(){
        if (self.imageDragging || seekDragging || volumeDragging)
            return;
        clearTimeout (endTimeout);
        if (endBlock.hasClass ('showHandles'))
            return;
        for (var i=0,j=self.seekBar.children.length; i<j; i++)
            self.seekBar.children[i].dropClass ('showHandles');
        endBlock.addClass ('showHandles');
    });
    endBlock.on ('mouseleave', function(){
        endTimeout = setTimeout (function(){
            endBlock.dropClass ('showHandles');
        }, 1200);
    });
};

Visualizer.prototype.addSkipSection = function(){
    var testBlock = startBlock.nextElementSibling;
    var testTimeout;
    testBlock.on ('mouseenter', function(){
        if (self.imageDragging || seekDragging || volumeDragging)
            return;
        clearTimeout (testTimeout);
        if (testBlock.hasClass ('showHandles'))
            return;
        for (var i=0,j=self.seekBar.children.length; i<j; i++)
            self.seekBar.children[i].dropClass ('showHandles');
        testBlock.addClass ('showHandles');
    });
    testBlock.on ('mouseleave', function(){
        testTimeout = setTimeout (function(){
            testBlock.dropClass ('showHandles');
        }, 1200);
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
    console.log ('loadImage', filepath);
    if (!filepath)
        throw new Error ('why the hell would this get called with no filename');

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
        console.log ('error!!!', err);
        var queue = self.loadingImages[filepath];
        delete self.loadingImages[filepath];
        for (var i=0,j=queue.length; i<j; i++)
            queue[i] (err);
    };
    imageObj.src = 'file://' + filepath;
};

Visualizer.prototype.redraw = function(){
    var width, height;
    if (this.vlc) {
        console.log (this.vlcCanvas.getAttribute ('width'));
        width = this.vlcCanvas.getAttribute ('width') || 800;
        height = this.vlcCanvas.getAttribute ('height') || 600;
    } else {
        if (!this.activeImage)
            return;
        width = Math.floor (this.activeImage.naturalWidth);
        height = Math.floor (this.activeImage.naturalHeight);
    }
    var canvasWidth = this.canvas.width;
    var canvasHeight = this.canvas.height;
    var wideRatio = canvasWidth / width;
    var tallRatio = canvasHeight / height;

    this.context.clearRect (0, 0, canvasWidth, canvasHeight);

    var useRatio;
    if (this.mode == 'normal') {
        if (this.manualZoom)
            useRatio = this.zoomRatio;
        else {
            if (wideRatio < 1)
                if (tallRatio < 1)
                    useRatio = wideRatio >= tallRatio ? tallRatio : wideRatio;
                else
                    useRatio = wideRatio;
            else if (tallRatio < 1)
                useRatio = tallRatio;
            else
                useRatio = 1;
        }
    } else {
        // zoom and flood modes
        if (this.manualZoom)
            useRatio = this.zoomRatio;
        else
            useRatio = wideRatio >= tallRatio ? tallRatio : wideRatio;

        if (this.mode == 'flood' && !this.manualZoom) {
            width *= 1.2;
            height *= 1.2;
            useRatio *= 1.2;
        }
    }

    this.zoomRatio = useRatio;

    width = Math.floor (width * useRatio);
    height = Math.floor (height * useRatio);
    var top = Math.floor (( canvasHeight - height ) / 2);
    var left = Math.floor (( canvasWidth - width ) / 2);
    if (this.offsetX)
        left += this.offsetX;
    if (this.offsetY)
        top += this.offsetY;

    // will these settings make the image too small or place it offscreen?
    // if so, adjust them
    if (useRatio < 1) {
        if (width < MIN_WIDTH) {

        }
        if (height < MIN_HEIGHT) {

        }
    }
    if (top + height < MIN_SHOWING) {
        // off top edge

    }
    if (left > canvasWidth - MIN_SHOWING) {
        // off right edge

    }
    if (top > canvasHeight - MIN_SHOWING) {
        // off bottom edge

    }
    if (left + canvasWidth < MIN_SHOWING) {
        // off left edge

    }

    if (this.dancer.firstChild) {
        this.dancer.firstChild.dispose();
        this.dancer.removeAttribute ('style');
    }
    if (this.vlc) {
        console.log ('set vlc', width, height);
        this.vlcCanvas.setAttribute (
            'style',
            'width:' + width + 'px;'
          + 'height:' + height + 'px;'
          + 'margin-left:' + left + 'px;'
          + 'margin-top:' + top + 'px;'
        );
    } else if (this.activeType != 'gif' && this.activePron.filename.slice (-4) != '.gif') {
        this.context.fillRect (left, top, width, height);
        this.context.drawImage (this.activeImage, left, top, width, height);
    } else {
        this.dancer.setAttribute (
            'style',
            'top:'+top+'px;left:'+left+'px;width:'+width+'px;height:'+height+'px;'
        );
        this.dancer.appendChild (this.activeImage);
    }
};
