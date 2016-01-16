
var path = require ('path');
var fs = require ('fs');
var lwip = require ('lwip');
var async = require ('async');
var mkdirp = require ('mkdirp');
var getType = require ('image-type');
var chimera = require ('wcjs-renderer');

var gui = global.window.nwDispatcher.requireNwGui();


/**     @module PornViewer:ThumbWarrior

*/

var ZOOM_INTO_MIN = 3 / 4;
var ZOOM_INTO_MAX = 4 / 3;
var MAX_CLIP = 0.20;
var THUMB_SIZE = 150;
var VID_THUMB_WIDTH = 126;
var VID_THUMB_HEIGHT = 130;
var CWD = process.cwd();
var THUMBS_DIR = path.join (gui.App.dataPath, 'thumbs');
var IMAGE_EXT = [ '.jpg', '.jpeg', '.png', '.gif' ];
var VID_THUMB = 'file://' + path.join (__dirname, 'video_thumb.png');
var VID_THUMB_TIMEOUT = 10000;
mkdirp.sync (THUMBS_DIR);

function FingerTrap (width) {
    this.width = width || 1;
    this.taken = 0;
    this.queue = [];
    this.isPaused = false;
};
FingerTrap.prototype.take = function (callback) {
    if (!this.isPaused && this.taken < this.width) {
        this.taken++;
        process.nextTick (callback);
        return;
    }
    this.queue.push (callback);
};
FingerTrap.prototype.free = function(){
    if (!this.queue.length || this.isPaused)
        this.taken--;
    else
        process.nextTick (this.queue.shift());
};
FingerTrap.prototype.pause = function(){
    this.isPaused = true;
};
FingerTrap.prototype.play = function(){
    this.isPaused = false;
    while (this.queue.length && this.taken < this.width) {
        this.taken++;
        process.nextTick (this.queue.shift());
    }
};

// these are global, not per-warrior
var IMG_THUMB_LOCK = new FingerTrap (16);
var VID_THUMB_LOCK = new FingerTrap (1);

function ThumbWarrior (document) {
    this.document = document;

    var waitingForOverlays = 3;
    var waitingCallback;
    var alreadyDone = false;

    var videoThumbOverlay = this.videoThumbOverlay = document.createElement ('img');
    videoThumbOverlay.setAttribute ('style', 'position:fixed;left:-1000px;width:150px;height:150px;');
    videoThumbOverlay.setAttribute ('src', 'video_overlay.png');
    document.body.appendChild (videoThumbOverlay);

    var videoLeftGutter = this.videoLeftGutter = document.createElement ('img');
    videoLeftGutter.setAttribute ('src', 'video_left_overlay.png');

    var videoRightGutter = this.videoRightGutter = document.createElement ('img');
    videoRightGutter.setAttribute ('src', 'video_right_overlay.png');

    this.workingCanvas = document.createElement ('canvas');
    this.workingCanvas.setAttribute ('style', 'position:fixed;left:-1000px;width:150px;height:150px;');
    document.body.appendChild (this.workingCanvas);
    this.targetCanvas = document.createElement ('canvas');
    this.targetCanvas.setAttribute ('style', 'position:fixed;left:-1000px;width:150px;height:150px;');
    this.targetCanvas.setAttribute ('width', THUMB_SIZE);
    this.targetCanvas.setAttribute ('height', THUMB_SIZE);
    document.body.appendChild (this.targetCanvas);
    this.finalCanvas = document.createElement ('canvas');
    this.finalCanvas.setAttribute ('style', 'position:fixed;left:-1000px;width:150px;height:150px;');
    document.body.appendChild (this.finalCanvas);
}

ThumbWarrior.prototype.processThumb = function (filepath, thumbpath, callback) {
    IMG_THUMB_LOCK.take (function(){
        var finalImage;
        var stats = {};
        async.parallel ([
            function (callback) {
                fs.readFile (filepath, function (err, buf) {
                    if (err)
                        return callback (err);
                    imageType = getType (buf);
                    if (!imageType)
                        return callback (new Error ('not a known image format'));
                    stats.type = imageType.ext;
                    lwip.open (buf, imageType.ext, function (err, image) {
                        if (err)
                            return callback (err);
                        finalImage = image;

                        var width = image.width();
                        var height = image.height();
                        stats.width = width;
                        stats.height = height;
                        stats.pixels = width * height;

                        if (width <= THUMB_SIZE && height <= THUMB_SIZE)
                            return callback();

                        if (width == height)
                            return image.resize (150, 150, function (err, image) {
                                if (err)
                                    return callback (err);
                                finalImage = image;
                                callback();
                            });

                        // var top, right, bottom, left, scale;
                        var finalWidth, finalHeight;
                        if (width > height) {
                            var maxClip = width * MAX_CLIP;
                            newWidth = Math.max (width - maxClip, height);
                            newHeight = height;
                            scale = THUMB_SIZE / newWidth;
                        } else {
                            var maxClip = width * MAX_CLIP;
                            newHeight = Math.max (height - maxClip, width);
                            newWidth = width;
                            scale = THUMB_SIZE / newHeight;
                        }

                        // finalize the transform
                        var batch = image.batch()
                         .crop (newWidth, newHeight)
                         .scale (scale)
                         ;
                        batch.exec (function (err, image) {
                            if (err)
                                return callback (err);
                            finalImage = image;
                            callback();
                        });
                    });
                });
            },
            function (callback) {
                fs.stat (filepath, function (err, filestats) {
                    if (err)
                        return callback (err);
                    stats.size = filestats.size;
                    stats.created = filestats.ctime.getTime();
                    stats.modified = filestats.mtime.getTime();
                    callback();
                });
            }
        ], function (err) {
            IMG_THUMB_LOCK.free();
            if (err)
                return callback (err, undefined, stats);

            // write the thumbnail data to disc
            finalImage.writeFile (thumbpath, 'png', function (err) {
                if (err)
                    return callback (err, undefined, stats);
                var finalHeight = finalImage.height();
                var pad = finalHeight < THUMB_SIZE ? Math.floor ((THUMB_SIZE - finalHeight) / 2) : 0;
                callback (undefined, pad, stats);
            });
        });
    });
};

ThumbWarrior.prototype.processVideoThumb = function (filepath, thumbpath, callback) {
    var self = this;
    VID_THUMB_LOCK.take (function(){
        var finalImage, thumbHeight;
        var stats = { type:'video' };
        async.parallel ([
            function (callback) {
                self.targetCanvas.getContext ('2d').clearRect (0, 0, self.targetCanvas.width, self.targetCanvas.height);
                self.finalCanvas.getContext ('2d').clearRect (0, 0, self.finalCanvas.width, self.finalCanvas.height);

                var alreadyDone = false;
                var vlc = chimera.init (self.workingCanvas, [], { preserveDrawingBuffer:true });
                vlc.audio.mute = true;
                vlc.play ('file:///' + filepath);
                // wait for the second frame after seeking
                var didSeek = false;
                var targetTime;
                var armed = false;
                var fname = path.parse (filepath).base;
                vlc.onerror = function (error) {
                    console.log ('vlc error', error);
                };
                function cancelCall(){
                    if (alreadyDone)
                        return;
                    alreadyDone = true;
                    vlc.stop();
                    callback (new Error ('failed to render any frames within timeout'));
                }
                var cancellationTimeout = setTimeout (cancelCall, VID_THUMB_TIMEOUT);
                async.parallel ([
                    function (callback) {
                        vlc.events.once ('LengthChanged', function (length) {
                            stats.length = length;
                            callback();
                        });
                    },
                    function (callback) {
                        vlc.events.on ('FrameReady', function (frame) {
                            if (alreadyDone) {
                                vlc.stop();
                                return;
                            }
                            if (!didSeek) {
                                didSeek = true;
                                targetTime = Math.floor (vlc.time = vlc.length * 0.2);
                                clearTimeout (cancellationTimeout);
                                cancellationTimeout = setTimeout (cancelCall, VID_THUMB_TIMEOUT);
                                return;
                            }
                            if (vlc.time < targetTime)
                                return;
                            if (!armed) {
                                armed = vlc.time;
                                return;
                            }
                            // must advance PAST the arming frame
                            if (vlc.time <= armed)
                                return;
                            clearTimeout (cancellationTimeout);
                            vlc.stop();
                            alreadyDone = true;

                            stats.width = frame.width;
                            stats.height = frame.height;
                            stats.pixels = stats.width * stats.height;

                            var wideRatio = VID_THUMB_WIDTH / frame.width;
                            var tallRatio = VID_THUMB_HEIGHT / frame.height;
                            var context = self.targetCanvas.getContext ('2d');
                            var newWidth, newHeight;
                            if (wideRatio < tallRatio) {
                                newWidth = Math.floor (frame.width * wideRatio);
                                newHeight = Math.floor (frame.height * wideRatio);
                            } else {
                                newWidth = Math.floor (frame.width * tallRatio);
                                newHeight = Math.floor (frame.height * tallRatio);
                            }
                            try {
                                context.drawImage (
                                    self.workingCanvas,
                                    Math.floor ((THUMB_SIZE - newWidth) / 2),
                                    0,
                                    newWidth,
                                    newHeight
                                );
                                if (newWidth == VID_THUMB_WIDTH) {
                                    context.drawImage (self.videoThumbOverlay, 0, 0);
                                    self.finalCanvas.setAttribute ('width', THUMB_SIZE);
                                    newWidth = THUMB_SIZE;
                                } else {
                                    var gutter = (THUMB_SIZE - VID_THUMB_WIDTH) / 2;
                                    context.drawImage (
                                        self.videoLeftGutter,
                                        Math.floor ((THUMB_SIZE - newWidth) / 2) - gutter,
                                        0
                                    );
                                    context.drawImage (
                                        self.videoRightGutter,
                                        Math.floor ((THUMB_SIZE + newWidth) / 2) - self.videoRightGutter.width + gutter,
                                        0
                                    );
                                    newWidth += THUMB_SIZE - VID_THUMB_WIDTH
                                    self.finalCanvas.setAttribute ('width', newWidth);
                                }
                                self.finalCanvas.setAttribute ('height', newHeight);
                                self.finalCanvas.getContext ('2d').drawImage (
                                    self.targetCanvas,
                                    Math.floor ((THUMB_SIZE - newWidth) / 2),
                                    0,
                                    newWidth,
                                    newHeight,
                                    0,
                                    0,
                                    newWidth,
                                    newHeight
                                );
                                finalImage = new Buffer (
                                    self.finalCanvas.toDataURL().replace(/^data:image\/\w+;base64,/, ""),
                                    'base64'
                                );
                            } catch (err) {
                                return callback (err);
                            }
                            thumbHeight = newHeight;
                            vlc.stop();
                            callback();
                        });
                    }
                ], callback);
            },
            function (callback) {
                fs.stat (filepath, function (err, filestats) {
                    if (err)
                        return callback (err);
                    stats.size = filestats.size;
                    stats.created = filestats.ctime.getTime();
                    stats.modified = filestats.mtime.getTime();
                    callback();
                });
            }
        ], function (err) {
            VID_THUMB_LOCK.free();
            if (err)
                return callback (err, undefined, stats);

            // write the thumbnail data to disc and update the thumbnail database
            fs.writeFile (thumbpath, finalImage, function (err) {
                if (err)
                    return callback (err);
                if (thumbHeight < VID_THUMB_HEIGHT)
                    pad = Math.floor ((VID_THUMB_HEIGHT - thumbHeight) / 2);
                callback (undefined, pad, stats);
            });
        });
    });
};

module.exports = ThumbWarrior;
