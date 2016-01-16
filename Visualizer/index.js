
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
var MIN_SHOWING = 50;
var MERGE_BLOCK = 0.5;
var DELETE_BLOCK = 0.3;
function Visualizer (winnder, prefs) {
    this.window = winnder;
    this.document = winnder.window.document;
    this.prefs = prefs || {};

    this.readyImages = {}; // images ready to display
    this.loadingImages = {};
    this.imageList = [];

    this.mode = window.localStorage.lastMode;
    if (!this.mode)
        this.mode = window.localStorage.lastMode = 'normal';

    var self = this;

    // set up our DOM presence
    this.controlsElem = this.document.getElementById ('Controls');
    this.controlsElem.on ('mousedown', function (event) { event.stopPropagation(); });
    this.canvas = this.document.getElementById ('Display');
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.document.getElementById ('Minimize').on ('click', function(){
        self.window.minimize();
    });
    this.dancer = this.document.getElementById ('Dancer');

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
    function clearDrag(){
        self.draggingImage = false;
        var item = self.draggingItem;
        delete self.draggingItem;
        if (!item)
            return;
        if (!item.hasClass ('seekHandle'))
            return;

        // clean up the seek bar
        var lastBlock, lastRight;
        var children = Array.apply ([], self.seekBar.children);
        for (var i=0,j=children.length; i<j; i++) {
            var block = children[i];
            if (!block.hasClass ('noplayBlock'))
                continue;

            var blockLeft = Number (block.style.left.slice(0, -1))
            var blockRight = 100 - Number (block.style.right.slice (0, -1));
            if (Math.abs (blockRight - blockLeft) <= DELETE_BLOCK) {
                block.dispose();
                continue;
            }

            if (!lastBlock || Math.abs (lastRight - blockLeft) > MERGE_BLOCK) {
                lastBlock = block;
                lastRight = blockRight;
                continue;
            }

            // merge the last block and this one
            if (block.getAttribute ('id') == 'EndBlock') {
                // merge right over left
                block.firstElementChild.dispose();
                block.appendChild (lastBlock.firstElementChild);
                block.style.left = lastBlock.style.left;
                lastBlock.dispose();
            } else {
                // merge left over right
                lastBlock.lastElementChild.dispose();
                lastBlock.appendChild (block.lastElementChild);
                lastBlock.style.right = block.style.right;
                block.dispose();
            }

            lastBlock = block;
            lastRight = blockRight;
        }
    }
    this.document.on ('mousedown', function (event) {
        if (event.button != 0)
            return;
        self.document.body.addClass ('draggingImage');
        self.imageDragging = true;
    });
    this.document.body.on ('mouseup', function(){
        self.document.body.dropClass ('draggingImage');
        self.imageDragging = false;
        clearDrag();
    });
    this.document.body.on ('mouseleave', function(){
        self.document.body.dropClass ('draggingImage');
        self.imageDragging = false;
        clearDrag();
    });
    this.document.body.on ('mousemove', function (event) {
        if (self.draggingItem || !self.imageDragging)
            return true;
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
    var SeekCaret = this.seekCaret = this.document.getElementById ('SeekCaret');
    this.seekTimeElem = this.document.getElementById ('SeekTime');
    var MuteIndicator = this.muteIndicator = this.document.getElementById ('MuteIndicator');
    var VolumeBar = this.volumeBar = this.document.getElementById ('VolumeBar');
    var VolumeCaret = this.volumeCaret = this.document.getElementById ('VolumeCaret');
    var playing = false;

    var VideoControls = this.document.getElementById ('VideoControls');
    VideoControls.on ('mousedown', function(){ return false; })
    VideoControls.on ('selectstart', function(){ return false; })

    PlayButton.on ('click', function(){
        if (!self.vlc) {
            this.dropClass ('playing');
            return;
        }
        if (self.vlc.playing) {
            this.dropClass ('playing');
            self.vlc.pause();
        } else {
            this.addClass ('playing');
            self.vlc.play();
        }
    });

    SeekBar.on ('mousedown', function (event) {
        if (!self.vlc)
            return;
        if (!self.vlc.length)
            return false;

        self.draggingItem = SeekCaret;

        var position = (event.clientX - this.getBoundingClientRect().left) / this.clientWidth;
        self.seekTimeElem.textContent = toTimeStr (self.vlc.time = self.vlc.length * position);
        SeekCaret.setAttribute ('style', 'left:' + (position * 100) + '%;');
        return false;
    });
    SeekCaret.on ('mousedown', function (event) {
        if (event.target !== SeekCaret)
            return;
        event.stopPropagation();
        if (!self.vlc)
            return false;

        self.draggingItem = SeekCaret;

        return false;
    });
    SeekBar.on ('dragstart', function (event) {
        if (!self.vlc)
            return false;
        event.preventDefault();
        event.stopPropagation();
        return false;
    });

    var stashedVolume = 100;
    if (Object.hasOwnProperty.call (this.prefs, 'volume')) {
        var position = this.prefs.volume / 100;
        VolumeCaret.setAttribute (
            'style',
            'left:' + (Math.floor (position * VolumeBar.offsetWidth) - VolumeBar.offsetWidth) + 'px;'
        );
        stashedVolume = this.prefs.volume;
    }
    MuteIndicator.on ('click', function (event) {
        if (!self.vlc)
            return false;
        if (self.vlc.audio.volume) {
            stashedVolume = self.vlc.audio.volume;
            self.prefs.volume = self.vlc.audio.volume = 0;
            this.setAttribute ('src', 'muted.png');
            VolumeCaret.setAttribute (
                'style',
                'left:' + (-1 * VolumeBar.offsetWidth) + 'px;'
            );
        } else {
            self.prefs.volume = self.vlc.audio.volume = stashedVolume;
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

        self.draggingItem = VolumeCaret;

        var position = self.prefs.volume = event.layerX / this.offsetWidth;
        var rough = self.prefs.volume = self.vlc.audio.volume = Math.floor (100 * position);
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

        self.draggingItem = VolumeCaret;

        return false;
    });
    VolumeBar.on ('dragstart', function (event) {
        if (!self.vlc)
            return false;
        event.preventDefault();
        event.stopPropagation();
        return false;
    });

    this.document.body.on ('mousemove', function (event) {
        if (!self.draggingItem || !event.movementX)
            return true;

        if (self.draggingItem === self.seekCaret) {
            var shift = event.movementX;
            var currentPosition = Number (self.draggingItem.style.left.slice (0, -1)) / 100;
            var currentTime = Math.floor (self.vlc.length * currentPosition);

            var currentPx = currentPosition * self.seekBar.clientWidth;

            var seekBox = self.seekBar.getBoundingClientRect();
            var newPx = Math.min (
                Math.max (event.clientX, seekBox.left), seekBox.right
            ) - seekBox.left;

            // var newPx = Math.min (Math.max (currentPx + shift, 0), self.seekBar.clientWidth);
            // var newTime = Math.floor (self.vlc.length * (newPx / self.seekBar.clientWidth));
            var newTime = Math.floor (self.vlc.length * (newPx / (seekBox.right - seekBox.left)));

            // is newTime within a noplayBlock?
            var activeBlock;
            for (var i=0,j=self.seekBar.children.length; i<j; i++) {
                var block = self.seekBar.children[i];
                if (!block.hasClass ('noplayBlock'))
                    continue;
                var endTime = Number (block.lastElementChild.getAttribute ('data-time'));
                if (block.id === 'EndBlock') {
                    if (endTime < newTime)
                        activeBlock = block;
                    break;
                } else if (endTime > newTime) {
                    if (
                        block.firstElementChild === block.lastElementChild
                     || Number (block.firstElementChild.getAttribute ('data-time')) < newTime
                    )
                        activeBlock = block;
                    break;
                }
            }

            if (activeBlock) {
                // scrolling from within? (is currentTime within the same block?)
                var startBlock;
                for (var i=0,j=self.seekBar.children.length; i<j; i++) {
                    var block = self.seekBar.children[i];
                    if (!block.hasClass ('noplayBlock'))
                        continue;
                    var endTime = Number (block.lastElementChild.getAttribute ('data-time'));
                    if (block.id === 'EndBlock') {
                        if (endTime < currentTime)
                            startBlock = block;
                        break;
                    } else if (endTime > currentTime) {
                        if (
                            block.firstElementChild === block.lastElementChild
                         || Number (block.firstElementChild.getAttribute ('data-time')) < currentTime
                        )
                            startBlock = block;
                        break;
                    }
                }

                if (!startBlock) {
                    var blockBox = activeBlock.getBoundingClientRect();
                    var middle = Math.floor ((blockBox.left + blockBox.right) / 2);
                    if (activeBlock.id === 'EndBlock')
                        newTime = Math.max (0, Number (
                            activeBlock.firstElementChild.getAttribute ('data-time')
                        ) - 1);
                    else if (event.clientX >= middle || activeBlock.id === 'StartBlock')
                        newTime = Number (
                            activeBlock.lastElementChild.getAttribute ('data-time')
                        ) + 1;
                    else
                        newTime = Math.max (0, Number (
                            activeBlock.firstElementChild.getAttribute ('data-time')
                        ) - 1);
                }
            }

            var newPosition = newTime / self.vlc.length;
            self.seekCaret.setAttribute ('style', 'left:' + ( newPosition * 100 ) + '%');
            self.vlc.time = newTime;
            return false;
        }

        if (self.draggingItem === VolumeCaret) {
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
            self.prefs.volume = self.vlc.audio.volume = Math.floor (100 * (newPosition / range));
            if (!newPosition)
                MuteIndicator.setAttribute ('src', 'muted.png');
            else
                MuteIndicator.setAttribute ('src', 'mute.png');
            return false;
        }

        if (self.vlc.isPlaying)
            self.vlc.pause();

        // move the caret

        // evaluate boundaries
        var rightEdge = self.draggingItem.hasClass ('endHandle');
        var currentPosition = rightEdge ?
            1 - (Number (self.draggingItem.parentNode.style.right.slice (0, -1)) / 100)
          : Number (self.draggingItem.parentNode.style.left.slice (0, -1)) / 100
          ;
        var currentPx = self.seekBar.clientWidth * currentPosition;
        var shift = event.movementX;
        var limit;
        if (shift > 0) {
            // look right for boundaries
            if (!rightEdge) {
                // the right boundary of this block
                limit = (
                    1 - (Number (self.draggingItem.parentNode.style.right.slice (0, -1)) / 100)
                ) * self.seekBar.clientWidth;
            } else {
                // the left boundary of the next block or end of the seekbar
                var next = self.draggingItem.parentNode.nextElementSibling;
                if (next.hasClass ('noplayBlock'))
                    limit = (Number (next.style.left.slice (0, -1)) / 100) * self.seekBar.clientWidth;
                else
                    limit = self.seekBar.clientWidth;
            }
            if (currentPx + shift > limit)
                shift = limit - currentPx;
        } else {
            // look left for boundaries
            if (rightEdge)
                // the left boundary of this block
                limit = (
                    Number (self.draggingItem.parentNode.style.left.slice (0, -1)) / 100
                ) * self.seekBar.clientWidth;
            else {
                // the right boundary of the previous block or end of the seekbar
                var previous = self.draggingItem.parentNode.previousElementSibling;
                if (previous)
                    limit = (
                        1 - (Number (previous.style.right.slice (0, -1)) / 100)
                    ) * self.seekBar.clientWidth;
                else
                    limit = 0;
            }
            if (currentPx + shift < limit)
                shift = limit - currentPx;
        }

        // commit shift to view
        if (!shift)
            return;

        var newPosition = ( currentPx + shift ) / self.seekBar.clientWidth;
        var newTime = self.vlc.time = Math.floor (newPosition * self.vlc.length);
        self.draggingItem.setAttribute ('data-time', newTime);
        self.draggingItem.firstChild.textContent = toTimeStr (newTime);
        if (rightEdge)
            self.draggingItem.parentNode.style.right = ((1 - newPosition) * 100) + '%';
        else
            self.draggingItem.parentNode.style.left = (newPosition * 100) + '%';
    });

    // context menu setup and display
    this.contextMenu = this.document.getElementById ('ContextMenu');
    this.contextMenuTargetInput = this.document.getElementById ('ContextMenuKeyboardTarget')
    this.contextMenu.on ('mousedown', function (event) { event.stopPropagation(); return false; });
    this.contextMenu.on ('mouseup', function (event) { event.stopPropagation(); return false; });
    this.contextMenu.on ('selectstart', function(){ return false; });
    this.videoMenuSection = this.document.getElementById ('CX_Options_Video');
    function dismissContextMenu(){
        delete self.lastVideoControlSection;
        self.contextMenu.dropClass ('active');
        self.contextMenuTargetInput.blur();
    }
    this.window.on ('blur', dismissContextMenu);
    this.document.body.on ('mouseup', function (event) {
        if (event.button != 2) {
            dismissContextMenu();
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
        self.contextMenuTargetInput.focus();
    });

    // context menu buttons
    var audioSectionButton =
        this.audioSectionButton =
        this.document.getElementById ('CX_Options_Audio');
    var subtitleSectionButton =
        this.subtitleSectionButton =
        this.document.getElementById ('CX_Options_Subtitles');
    this.audioTrackButtons = audioSectionButton.lastElementChild;
    this.audioTrackButtons.on ('mousedown', function (event) {
        event.stopPropagation();
    });
    this.subtitleTrackButtons = subtitleSectionButton.lastElementChild;
    this.subtitleTrackButtons.on ('mousedown', function (event) {
        event.stopPropagation();
    });
    function toggleAudioSection(){
        if (!self.vlc || !self.audioTrackButtons.children.length)
            return;
        if (audioSectionButton.hasClass ('open'))
            audioSectionButton.dropClass ('open');
        else {
            self.lastVideoControlSection = audioSectionButton;
            audioSectionButton.addClass ('open');
            subtitleSectionButton.dropClass ('open');
        }
    }
    audioSectionButton.on ('click', toggleAudioSection);
    function toggleSubtitleSection(){
        if (!self.vlc || !self.subtitleTrackButtons.children.length)
            return;
        if (subtitleSectionButton.hasClass ('open'))
            subtitleSectionButton.dropClass ('open');
        else {
            self.lastVideoControlSection = subtitleSectionButton;
            subtitleSectionButton.addClass ('open');
            audioSectionButton.dropClass ('open');
        }
    }
    subtitleSectionButton.on ('click', toggleSubtitleSection);
    var resetViewButton = this.document.getElementById ('CX_Options_Reset');
    function resetView(){
        dismissContextMenu();
        self.offsetX = 0;
        self.offsetY = 0;
        self.manualZoom = false;
        self.redraw();
    }
    resetViewButton.on ('click', resetView);
    var resetVideoButton = this.document.getElementById ('CX_Options_Video_Reset');
    function resetPlayback(){
        dismissContextMenu();
        self.seekBar.disposeChildren();
        self.seekBar.appendChild (self.seekCaret);
        self.redraw();
    }
    resetVideoButton.on ('click', resetPlayback);
    var startHereButton = this.document.getElementById ('CX_Options_Start');
    function startHere(){
        self.setStartTime();
        dismissContextMenu();
    }
    startHereButton.on ('click', startHere);
    var endHereButton = this.document.getElementById ('CX_Options_End');
    function endHere(){
        self.setEndTime();
        dismissContextMenu();
    }
    endHereButton.on ('click', endHere);
    var skipHereButton = this.document.getElementById ('CX_Options_Skip');
    function skipHere(){
        self.addSkipSection();
        dismissContextMenu();
    }
    skipHereButton.on ('click', skipHere);

    var contextKeys = {
        r:  resetView,
        a:  toggleAudioSection,
        t:  toggleSubtitleSection,
        s:  startHere,
        p:  endHere,
        k:  skipHere,
        v:  resetPlayback
    };
    this.contextMenuTargetInput.on ('keypress', function (event) {
        if (event.altKey || event.ctrlKey || event.shiftKey || event.metaKey)
            return;
        var str = String.fromCharCode (event.charCode).toLowerCase();
        if (Object.hasOwnProperty.call (contextKeys, str)) {
            contextKeys[str]();
            return;
        }
        if (str < 0 || str > 9 || !self.lastVideoControlSection)
            return;

        // numerical selection of audio or subtitle track
        var childElem = self.lastVideoControlSection.lastElementChild;
        var selectedI = Number (str);
        if (selectedI >= childElem.children.length)
            return;
        for (var i=0,j=childElem.children.length; i<j; i++)
            if (childElem.children[i].hasClass ('active')) {
                childElem.children[i].dropClass ('active');
                break;
            }
        childElem.children[selectedI].addClass ('active');
        if (self.lastVideoControlSection === self.audioSectionButton)
            self.vlc.audio.track = selectedI;
        else
            self.vlc.subtitles.track = selectedI;
        setTimeout (dismissContextMenu, 500);
    });

    this.document.body.on ('keyup', function (event) {
        if (
            event.keyCode != 18
         && event.keyCode != 93
         && event.keyCode != 91
        )
            return;

        if (self.contextMenu.hasClass ('active')) {
            dismissContextMenu();
            return;
        }
        self.setupContextMenu();
        self.contextMenu.setAttribute ('style', 'left:50px;top:100px;');
        self.contextMenu.addClass ('active');
        self.contextMenuTargetInput.focus();
    });
}
module.exports = Visualizer;

Visualizer.prototype.setupContextMenu = function(){
    var self = this;
    if (!this.vlc)
        this.videoMenuSection.dropClass ('active');
    else {
        this.audioSectionButton.dropClass ('open');
        this.subtitleSectionButton.dropClass ('open');
        delete this.lastVideoControlSection;
        this.videoMenuSection.addClass ('active');
        if (!this.vlc.audio) {
            // update when video is loaded
            this.vlc.events.once ('FrameReady', function(){
                self.setupContextMenu();
            });
        } else {
            this.audioTrackButtons.disposeChildren();
            var trackNum = this.vlc.audio.track;
            if (trackNum < 0)
                trackNum = 0;
            if (this.vlc.audio.count)
                this.audioSectionButton.dropClass ('empty');
            else
                this.audioSectionButton.addClass ('empty');
            for (var i=0,j=this.vlc.audio.count; i<j; i++) {
                var trackButton = this.document.createElement ('div');
                trackButton.className = trackNum == i ? 'CX_Option active' : 'CX_Option';
                trackButton.setAttribute ('data-index', i);
                var shortspan = this.document.createElement ('span');
                shortspan.className = 'CX_Shortcut';
                shortspan.textContent = i + ' ';
                trackButton.appendChild (shortspan);
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
                trackButton.appendChild (this.document.createTextNode (this.vlc.audio[i]));
                this.audioTrackButtons.appendChild (trackButton);
            }

            this.subtitleTrackButtons.disposeChildren();
            var subNum = this.vlc.subtitles.track;
            if (subNum < 0)
                subNum = 0;
            if (this.vlc.subtitles.count)
                this.subtitleSectionButton.dropClass ('empty');
            else
                this.subtitleSectionButton.addClass ('empty');
            for (var i=0,j=this.vlc.subtitles.count; i<j; i++) {
                var trackButton = this.document.createElement ('div');
                trackButton.className = subNum == i ? 'CX_Option active' : 'CX_Option';
                trackButton.setAttribute ('data-index', i);
                var shortspan = this.document.createElement ('span');
                shortspan.className = 'CX_Shortcut';
                shortspan.textContent = i + ' ';
                trackButton.appendChild (shortspan);
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
                trackButton.appendChild (this.document.createTextNode (this.vlc.subtitles[i]));
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
    this.seekCaret.setAttribute ('style', 'left:' + (position * this.seekBar.clientWidth) + 'px;');
};

var SEEK_TIME_HYSTERESIS = 11;
Visualizer.prototype.display = function (prawn) {
    var self = this;

    if (this.activePron) {
        this.commitViewToPron();
        this.activePron.saveExtra();
    }

    if (this.vlc) {
        this.vlc.stop();
        delete this.vlc;
        this.vlcElem.dropClass ('active');
        this.seekBar.disposeChildren();
        this.seekBar.appendChild (this.seekCaret);
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

    // redo the context menu if needed
    if (this.contextMenu.hasClass ('active'))
        this.setupContextMenu();

    // image handling is simple
    if (prawn.isImage) {
        this.loadImage (prawn.fullpath, function (err, image) {
            if (err)
                return;
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
    var gl = this.vlcCanvas.getContext("webgl");
    gl.clearColor (0, 0, 0, 0);
    gl.clear (gl.COLOR_BUFFER_BIT);
    if (Object.hasOwnProperty.call (this.prefs, 'volume')) {
        this.vlc.volume = this.prefs.volume;
        this.volumeCaret.setAttribute (
            'style',
            'left:'
          + (Math.floor ((this.prefs.volume / 100) * this.volumeBar.offsetWidth) - this.volumeBar.offsetWidth)
          + 'px;'
        );
        if (!this.prefs.volume)
            this.muteIndicator.setAttribute ('src', 'muted.png');
        else
            this.muteIndicator.setAttribute ('src', 'mute.png');
    }


    var videoInitialized = false;
    prawn.once ('thumb', function(){
        // setup start/end/skip
        if (prawn.extra.start) {
            var startBlock = self.document.createElement ('div');
            startBlock.className = 'noplayBlock';
            startBlock.setAttribute ('id', 'StartBlock');
            startBlock.setAttribute (
                'style',
                'left:0%;right:' + ((1 - (prawn.extra.start / prawn.stats.length)) * 100) + '%'
            );
            var startHandle = self.document.createElement ('div');
            startHandle.className = 'seekHandle endHandle';
            startHandle.setAttribute ('data-time', prawn.extra.start);
            var timeSpan = self.document.createElement ('span');
            timeSpan.textContent = toTimeStr (prawn.extra.start);
            startHandle.appendChild (timeSpan);
            startHandle.appendChild (self.document.createElement ('div'));
            startBlock.appendChild (startHandle);
            self.seekBar.appendChild (startBlock);

            // mouse enter/leave events make it easier to grab the handles
            var startTimeout;
            startBlock.on ('mouseenter', function(){
                clearTimeout (startTimeout);
                if (this.hasClass ('showHandles'))
                    return;
                for (var i=0,j=self.seekBar.children.length; i<j; i++)
                    self.seekBar.children[i].dropClass ('showHandles');
                this.addClass ('showHandles');
            });
            startBlock.on ('mouseleave', function(){
                startTimeout = setTimeout (function(){
                    startBlock.dropClass ('showHandles');
                }, 1200);
            });
            startHandle.on ('mousedown', function (event) {
                event.stopPropagation();
                self.draggingItem = this;
                return false;
            });
        }
        if (prawn.extra.skip)
            prawn.extra.skip.forEach (function (skipTimes) {
                var skipBlock = self.document.createElement ('div');
                skipBlock.className = 'noplayBlock';
                skipBlock.setAttribute (
                    'style',
                    'left:'
                      + ((skipTimes[0] / prawn.stats.length) * 100)
                      + '%;right:'
                      + ((1 - (skipTimes[1] / prawn.stats.length)) * 100)
                      + '%'
                );
                var startHandle = self.document.createElement ('div');
                startHandle.className = 'seekHandle startHandle';
                startHandle.setAttribute ('data-time', skipTimes[0]);
                var timeSpan = self.document.createElement ('span');
                timeSpan.textContent = toTimeStr (skipTimes[0]);
                startHandle.appendChild (timeSpan);
                startHandle.appendChild (self.document.createElement ('div'));
                skipBlock.appendChild (startHandle);
                var endHandle = self.document.createElement ('div');
                endHandle.className = 'seekHandle endHandle';
                endHandle.setAttribute ('data-time', skipTimes[1]);
                var timeSpan = self.document.createElement ('span');
                timeSpan.textContent = toTimeStr (skipTimes[1]);
                endHandle.appendChild (timeSpan);
                endHandle.appendChild (self.document.createElement ('div'));
                skipBlock.appendChild (endHandle);
                self.seekBar.appendChild (skipBlock);

                // mouse enter/leave events make it easier to grab the handles
                var skipTimeout;
                skipBlock.on ('mouseenter', function(){
                    clearTimeout (skipTimeout);
                    if (this.hasClass ('showHandles'))
                        return;
                    for (var i=0,j=self.seekBar.children.length; i<j; i++)
                        self.seekBar.children[i].dropClass ('showHandles');
                    this.addClass ('showHandles');
                });
                skipBlock.on ('mouseleave', function(){
                    skipTimeout = setTimeout (function(){
                        skipBlock.dropClass ('showHandles');
                    }, 1200);
                });
                startHandle.on ('mousedown', function (event) {
                    event.stopPropagation();
                    self.draggingItem = startHandle;
                    return false;
                });
                endHandle.on ('mousedown', function (event) {
                    event.stopPropagation();
                    self.draggingItem = endHandle;
                    return false;
                });
            });
        if (prawn.extra.end) {
            var endBlock = self.document.createElement ('div');
            endBlock.className = 'noplayBlock';
            endBlock.setAttribute ('id', 'EndBlock');
            endBlock.setAttribute (
                'style',
                'left:' + ((prawn.extra.end / prawn.stats.length) * 100) + '%;right:0%;'
            );
            var endHandle = self.document.createElement ('div');
            endHandle.className = 'seekHandle startHandle';
            endHandle.setAttribute ('data-time', prawn.extra.end);
            var timeSpan = self.document.createElement ('span');
            timeSpan.textContent = toTimeStr (prawn.extra.end);
            endHandle.appendChild (timeSpan);
            endHandle.appendChild (self.document.createElement ('div'));
            endBlock.appendChild (endHandle);
            self.seekBar.appendChild (endBlock);

            // mouse enter/leave events make it easier to grab the handles
            var endTimeout;
            endBlock.on ('mouseenter', function(){
                clearTimeout (endTimeout);
                if (this.hasClass ('showHandles'))
                    return;
                for (var i=0,j=self.seekBar.children.length; i<j; i++)
                    self.seekBar.children[i].dropClass ('showHandles');
                this.addClass ('showHandles');
            });
            endBlock.on ('mouseleave', function(){
                endTimeout = setTimeout (function(){
                    endBlock.dropClass ('showHandles');
                }, 1200);
            });
            endHandle.on ('mousedown', function (event) {
                event.stopPropagation();
                self.draggingItem = this;
                return false;
            });
        }
        self.seekBar.appendChild (self.seekCaret);
        if (!videoInitialized)
            return;
        if (prawn.extra.start)
            self.vlc.time = prawn.extra.start;
        if (Object.hasOwnProperty.call (prawn.extra, 'audio'))
            self.vlc.audio.track = prawn.extra.audio;
        if (Object.hasOwnProperty.call (prawn.extra, 'subs'))
            self.vlc.subtitles.track = prawn.extra.subs;
    });

    this.vlc.events.once ('FrameSetup', function (width, height, format, frame) {
        videoInitialized = true;
        self.vlcCanvas.setAttribute ('width', width);
        self.vlcCanvas.setAttribute ('height', height);
        if (self.activePron.extra.start)
            self.vlc.time = self.activePron.extra.start;
        if (Object.hasOwnProperty.call (self.activePron.extra, 'audio'))
            self.vlc.audio.track = self.activePron.extra.audio;
        if (Object.hasOwnProperty.call (self.activePron.extra, 'subs'))
            self.vlc.subtitles.track = self.activePron.extra.subs;
        self.redraw();
        self.setupContextMenu();
    });

    var isPlayingTimeout;
    this.vlc.onTimeChanged = function (time) {
        if (self.vlc !== currentVLC)
            return;
        self.seekTimeElem.textContent = toTimeStr (time);
        clearTimeout (isPlayingTimeout);
        isPlayingTimeout = setTimeout (function(){
            if (self.vlc !== currentVLC)
                return;
            if (self.vlc.playing)
                PlayButton.addClass ('playing');
            else
                PlayButton.dropClass ('playing');
        }, 300);

        var currentPosition = Number (self.seekCaret.style.left.slice (0, -1)) / 100;
        var currentTime = Math.floor (self.vlc.length * currentPosition);
        var currentPx = currentPosition * self.seekBar.clientWidth;
        var seekBox = self.seekBar.getBoundingClientRect();

        // is newTime within a noplayBlock?
        var activeBlock;
        for (var i=0,j=self.seekBar.children.length; i<j; i++) {
            var block = self.seekBar.children[i];
            if (!block.hasClass ('noplayBlock'))
                continue;
            var endTime = Number (block.lastElementChild.getAttribute ('data-time'));
            if (block.id === 'EndBlock') {
                if (endTime < time)
                    activeBlock = block;
                break;
            } else if (endTime > time) {
                if (
                    block.firstElementChild === block.lastElementChild
                 || Number (block.firstElementChild.getAttribute ('data-time')) < time
                )
                    activeBlock = block;
                break;
            }
        }

        if (activeBlock) {
            // scrolling from within? (is currentTime within the same block?)
            var startBlock;
            for (var i=0,j=self.seekBar.children.length; i<j; i++) {
                var block = self.seekBar.children[i];
                if (!block.hasClass ('noplayBlock'))
                    continue;
                var endTime = Number (block.lastElementChild.getAttribute ('data-time'));
                if (block.id === 'EndBlock') {
                    if (endTime < currentTime)
                        startBlock = block;
                    break;
                } else if (endTime > currentTime) {
                    if (
                        block.firstElementChild === block.lastElementChild
                     || Number (block.firstElementChild.getAttribute ('data-time')) < currentTime
                    )
                        startBlock = block;
                    break;
                }
            }

            if (!startBlock) {
                var blockBox = activeBlock.getBoundingClientRect();
                var middle = Math.floor ((blockBox.left + blockBox.right) / 2);
                if (activeBlock.id === 'EndBlock') {
                    self.vlc.pause();
                    var startBlock = self.document.getElementById ('StartBlock');
                    var newTime;
                    if (startBlock)
                        newTime = self.vlc.time = Number (startBlock.lastElementChild.getAttribute ('data-time'));
                    else
                        newTime = self.vlc.time = 1;
                    self.seekCaret.style.left = ((newTime / self.vlc.length) * 100) + '%';
                    return;
                } else {
                    time = Number (
                        activeBlock.lastElementChild.getAttribute ('data-time')
                    ) + 1;
                    // skip!
                    self.vlc.time = time;
                }
            }
        }

        var newPosition = time / self.vlc.length;
        self.seekCaret.setAttribute ('style', 'left:' + ( newPosition * 100 ) + '%');

        var seekRect = self.seekBar.getBoundingClientRect();
        var caretRect = self.seekCaret.getBoundingClientRect();
        var rightEdge = caretRect.right + self.seekTimeElem.clientWidth;
        if (rightEdge > seekRect.right)
            self.seekTimeElem.addClass ('left');
        else if (seekRect.right - rightEdge > SEEK_TIME_HYSTERESIS)
            self.seekTimeElem.dropClass ('left');
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
    var startBlock, handle;
    if (this.seekBar.firstChild && this.seekBar.firstChild.id == 'StartBlock') {
        startBlock = this.seekBar.firstChild;
        startBlock.firstChild.firstChild.textContent = toTimeStr (this.vlc.time);
    } else {
        startBlock = this.document.createElement ('div');
        startBlock.setAttribute ('id', 'StartBlock');
        startBlock.className = 'noplayBlock';
        handle = this.document.createElement ('div');
        handle.setAttribute ('data-time', this.vlc.time);
        var timeSpan = this.document.createElement ('span');
        timeSpan.textContent = toTimeStr (this.vlc.time);
        handle.appendChild (timeSpan);
        handle.appendChild (this.document.createElement ('div'));
        handle.className = 'seekHandle endHandle';
        startBlock.appendChild (handle);
        this.seekBar.insertBefore (startBlock, this.seekBar.firstChild);

        // mouse enter/leave events make it easier to grab the handles
        var self = this;
        var startTimeout;
        startBlock.on ('mouseenter', function(){
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

        handle.on ('mousedown', function (event) {
            event.stopPropagation();
            self.draggingItem = handle;
            return false;
        });
    }

    startBlock.setAttribute (
        'style',
        'left:0%;right:' + ((1 - (this.vlc.time / this.vlc.length)) * 100) + '%'
    );
};

Visualizer.prototype.setEndTime = function(){
    this.vlc.pause();
    var endBlock, handle;
    if (this.seekCaret.previousSibling && this.seekCaret.previousSibling.id == 'EndBlock') {
        endBlock = this.seekCaret.previousSibling;
        endBlock.firstChild.setAttribute ('data-time', this.vlc.time);
        endBlock.firstChild.firstChild.textContent = toTimeStr (this.vlc.time);
    } else {
        endBlock = this.document.createElement ('div');
        endBlock.setAttribute ('id', 'EndBlock');
        endBlock.className = 'noplayBlock';
        handle = this.document.createElement ('div');
        handle.setAttribute ('data-time', this.vlc.time);
        var timeSpan = this.document.createElement ('span');
        timeSpan.textContent = toTimeStr (this.vlc.time);
        handle.appendChild (timeSpan);
        handle.appendChild (this.document.createElement ('div'));
        handle.className = 'seekHandle startHandle';
        endBlock.appendChild (handle);
        this.seekBar.insertBefore (endBlock, this.seekCaret);

        // mouse enter/leave events make it easier to grab the handles
        var self = this;
        var startTimeout;
        endBlock.on ('mouseenter', function(){
            clearTimeout (startTimeout);
            if (endBlock.hasClass ('showHandles'))
                return;
            for (var i=0,j=self.seekBar.children.length; i<j; i++)
                self.seekBar.children[i].dropClass ('showHandles');
            endBlock.addClass ('showHandles');
        });
        endBlock.on ('mouseleave', function(){
            startTimeout = setTimeout (function(){
                endBlock.dropClass ('showHandles');
            }, 1200);
        });

        handle.on ('mousedown', function (event) {
            event.stopPropagation();
            self.draggingItem = handle;
            return false;
        });
    }

    endBlock.setAttribute (
        'style',
        'right:0%;left:' + ((this.vlc.time / this.vlc.length) * 100) + '%;'
    );
};

var DEFAULT_SKIP = 0.1;
Visualizer.prototype.addSkipSection = function(){
    this.vlc.pause();
    var time = this.vlc.time;
    var endTime = Math.floor (time + (this.vlc.length * DEFAULT_SKIP));

    var block, startHandle, endHandle;

    // existing?
    var vidLength = this.vlc.length;
    for (var i=0,j=this.seekBar.children.length; i<j; i++) {
        var existingBlock = this.seekBar.children[i];
        if (!existingBlock.hasClass ('noplayBlock'))
            continue;
        var oldLeft = vidLength * ( Number (existingBlock.style.left.slice (0, -1)) / 100);
        var oldRight = vidLength * ( 1 - (Number (existingBlock.style.right.slice (0, -1)) / 100));

        if (
            ( oldLeft <= time && oldRight >= time )
         || ( oldLeft <= endTime && oldRight >= endTime )
        ) {
            block = existingBlock;
            if (block.id === 'StartBlock') {
                this.vlc.time = oldRight;
                return;
            } else if (block.id === 'EndBlock') {
                this.vlc.time = oldLeft;
                return;
            } else {
                startHandle = block.firstChild;
                endHandle = block.lastChild;
                break;
            }
        }
    }

    if (!block) {
        block = this.document.createElement ('div');
        block.className = 'noplayBlock';
        startHandle = this.document.createElement ('div');
        startHandle.setAttribute ('data-time', time);
        var startTimeSpan = this.document.createElement ('span');
        startTimeSpan.textContent = toTimeStr (time);
        startHandle.appendChild (startTimeSpan);
        startHandle.appendChild (this.document.createElement ('div'));
        startHandle.className = 'seekHandle startHandle';
        block.appendChild (startHandle);
        endHandle = this.document.createElement ('div');
        endHandle.setAttribute ('data-time', endTime);
        var endTimeSpan = this.document.createElement ('span');
        endTimeSpan.textContent = toTimeStr (endTime);
        endHandle.appendChild (endTimeSpan);
        endHandle.appendChild (this.document.createElement ('div'));
        endHandle.className = 'seekHandle endHandle';
        block.appendChild (endHandle);
        if (
            this.seekCaret
         && this.seekCaret.previousElementSibling
         && this.seekCaret.previousElementSibling.getAttribute ('id') == 'EndBlock'
        )
            this.seekBar.insertBefore (block, this.seekCaret.previousElementSibling);
        else
            this.seekBar.insertBefore (block, this.seekCaret);

        // mouse enter/leave events make it easier to grab the handles
        var self = this;
        var startTimeout;
        block.on ('mouseenter', function(){
            clearTimeout (startTimeout);
            if (block.hasClass ('showHandles'))
                return;
            for (var i=0,j=self.seekBar.children.length; i<j; i++)
                self.seekBar.children[i].dropClass ('showHandles');
            block.addClass ('showHandles');
        });
        block.on ('mouseleave', function(){
            startTimeout = setTimeout (function(){
                block.dropClass ('showHandles');
            }, 1200);
        });

        startHandle.on ('mousedown', function (event) {
            event.stopPropagation();
            self.draggingItem = startHandle;
            return false;
        });

        endHandle.on ('mousedown', function (event) {
            event.stopPropagation();
            self.draggingItem = endHandle;
            return false;
        });
    }

    var pct = 100 * (time / this.vlc.length);
    var endPct = 100 * (1 - (endTime / this.vlc.length));
    block.setAttribute (
        'style',
        'left:' + pct + '%;right:' + endPct + '%;'
    );
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
        console.log ('loadImage error', err);
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
    if (top + height < MIN_SHOWING) {       // off top edge
        top = MIN_SHOWING - height;
        if (this.offsetY)
            this.offsetY = top - Math.floor ((canvasHeight - height) / 2);
    }
    if (left > canvasWidth - MIN_SHOWING) { // off right edge
        left = canvasWidth - MIN_SHOWING;
        if (this.offsetX)
            this.offsetX = left - Math.floor ((canvasWidth - width) / 2);
    }
    if (top > canvasHeight - MIN_SHOWING) { // off bottom edge
        top = canvasHeight - MIN_SHOWING;
        if (this.offsetY)
            this.offsetY = top - Math.floor ((canvasHeight - height) / 2);
    }
    if (left + width < MIN_SHOWING) {       // off left edge
        left = MIN_SHOWING - width;
        if (this.offsetX)
            this.offsetX = left - Math.floor ((canvasWidth - width) / 2);
    }

    if (this.dancer.firstChild) {
        this.dancer.firstChild.dispose();
        this.dancer.removeAttribute ('style');
    }
    if (this.vlc) {
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

Visualizer.prototype.savePron = function (callback) {
    if (!this.activePron) {
        if (callback)
            process.nextTick (callback);
        return;
    }
    this.commitViewToPron();
    this.activePron.saveExtra (callback);
};

Visualizer.prototype.commitViewToPron = function(){
    // save any custom view info to disk
    if (this.offsetX)
        this.activePron.extra.X = this.offsetX;
    else
        delete this.activePron.extra.X;
    if (this.offsetY)
        this.activePron.extra.Y = this.offsetY;
    else
        delete this.activePron.extra.Y;
    if (this.manualZoom || this.offsetX || this.offsetY)
        this.activePron.extra.zoom = this.zoomRatio;
    else
        delete this.activePron.extra.zoom;

    if (this.activePron.isVideo) {
        var start, end, skip = [];
        for (var i=0,j=this.seekBar.children.length; i<j; i++) {
            var block = this.seekBar.children[i];
            if (!block.hasClass ('noplayBlock'))
                continue;
            if (block.id === 'StartBlock')
                start = Number (block.firstChild.getAttribute ('data-time'));
            else if (block.id === 'EndBlock')
                end = Number (block.firstChild.getAttribute ('data-time'));
            else
                skip.push ([
                    Number (block.firstChild.getAttribute ('data-time')),
                    Number (block.lastChild.getAttribute ('data-time'))
                ]);
        }
        if (start)
            this.activePron.extra.start = start;
        else
            delete this.activePron.extra.start;
        if (end)
            this.activePron.extra.end = end;
        else
            delete this.activePron.extra.end;
        if (skip.length)
            this.activePron.extra.skip = skip;
        else
            delete this.activePron.extra.skip;
        if (this.vlc) {
            this.activePron.extra.audio = this.vlc.audio.track;
            this.activePron.extra.subs = this.vlc.subtitles.track;
        }
    }
}
