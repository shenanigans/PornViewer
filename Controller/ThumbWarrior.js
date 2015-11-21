
var path = require ('path');
var fs = require ('fs');
var lwip = require ('lwip');
var uid = require ('infosex').uid.craft;
var async = require ('async');
var mkdirp = require ('mkdirp');
var getType = require ('image-type');
var chimera = require ('wcjs-renderer');

var gui = global.window.nwDispatcher.requireNwGui();


/**     @module PornViewer:ThumbWarrior

*/
var dbReady = false, dbQueue = [];
var db = window.openDatabase ('pornviewer', '', 'image info', 10000 * 1024);
db.changeVersion (db.version, "1.2", function (tx) {
    tx.executeSql ('CREATE TABLE IF NOT EXISTS images (id unique, directory, filename, thumbnail, pad, type, size, created, modified, Primary Key (id))');
    tx.executeSql ('CREATE UNIQUE INDEX IF NOT EXISTS directory ON images (directory, filename)');
    // tx.executeSql ('CREATE TABLE metadata (image, key, value, Foreign Key (image))');
    // tx.executeSql ('CREATE INDEX image ON metadata (image)');
}, function (err) {
    // database failure
    console.log ('db failed', err);
}, function(){
    dbReady = true;
    for (var i=0,j=dbQueue.length; i<j; i++)
        dbQueue[i]();
    delete dbQueue;
});

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
var VID_THUMB_TIMEOUT = 2000;
mkdirp.sync (THUMBS_DIR);

function ThumbWarrior (document) {
    this.document = document;

    var waitingForOverlays = 3;
    var waitingCallback;
    var alreadyDone = false;

    var videoThumbOverlay = this.videoThumbOverlay = document.createElement ('img');
    videoThumbOverlay.onload = function (event) {
        if (!--waitingForOverlays && waitingCallback)
            waitingCallback();
    };
    videoThumbOverlay.onerror = function (event) {
        if (alreadyDone)
            return;
        alreadyDone = true;
        callback (new Error ('failed to load full-width video overlay image'));
    };
    videoThumbOverlay.setAttribute ('style', 'position:fixed;left:-1000px;width:150px;height:150px;');
    videoThumbOverlay.setAttribute ('src', 'video_overlay.png');
    document.body.appendChild (videoThumbOverlay);

    var videoLeftGutter = this.videoLeftGutter = document.createElement ('img');
    videoLeftGutter.onload = function (event) {
        if (!--waitingForOverlays && waitingCallback)
            waitingCallback();
    };
    videoLeftGutter.onerror = function (event) {
        if (alreadyDone)
            return;
        alreadyDone = true;
        callback (new Error ('failed to load left video overlay image'));
    };
    videoLeftGutter.setAttribute ('src', 'video_left_overlay.png');

    var videoRightGutter = this.videoRightGutter = document.createElement ('img');
    videoRightGutter.onload = function (event) {
        if (!--waitingForOverlays && waitingCallback)
            waitingCallback();
    };
    videoRightGutter.onerror = function (event) {
        if (alreadyDone)
            return;
        alreadyDone = true;
        callback (new Error ('failed to load right video overlay image'));
    };
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
module.exports = ThumbWarrior;

/**     @property/Function getThumb

*/
ThumbWarrior.prototype.getThumb = function (dirpath, filename, callback) {
    var self = this;
    if (!dbReady) {
        dbQueue.push (function(){ self.getThumb (dirpath, filename, callback); });
        return;
    }

    var filepath = path.join (dirpath, filename);
    var thumbPath, pad, stats, imageType, newThumbPath, srcImage;
    var newWidth, newHeight, scale;
    async.parallel ([
        function (callback) {
            uid (function (newID) {
                newThumbPath = path.join (THUMBS_DIR, newID + '.png');
                callback();
            });
        },
        function (callback) {
            db.transaction (function (tx) {
                tx.executeSql (
                    'SELECT * FROM images WHERE directory=(?) AND filename=(?)',
                    [ dirpath, filename ],
                    function (tx, results) {
                        if (!results.rows.length)
                            return callback();
                        var row = results.rows.item(0);
                        thumbPath = row.thumbnail;
                        pad = row.pad;
                        stats = { type:row.type, size:row.size, created:row.created, modified:row.modified };
                        callback();
                    }
                );
            });
        },
    ], function(){
        if (thumbPath)
            return callback (undefined, 'file://'+thumbPath, pad, stats);

        // video?
        var isVideo = true;
        for (var i=0,j=IMAGE_EXT.length; i<j; i++) {
            var ext = IMAGE_EXT[i];
            if (filepath.slice (-1 * ext.length) === ext) {
                isVideo = false;
                break;
            }
        }
        if (isVideo) {
            return self.processVideoThumb (filepath, function (err, finalBuf, thumbHeight, stats) {
                if (err)
                    return callback (err, undefined, undefined, stats);

                // write the thumbnail data to disc and update the thumbnail database
                fs.writeFile (newThumbPath, finalBuf, function (err) {
                    if (err)
                        return callback (err);
                    if (thumbHeight < VID_THUMB_HEIGHT)
                        pad = Math.floor (VID_THUMB_HEIGHT - thumbHeight);
                    db.transaction (function (tx) {
                        tx.executeSql (
                            'INSERT OR REPLACE INTO images (directory, filename, thumbnail, pad, type, size, created, modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [ dirpath, filename, newThumbPath, pad||0, stats.type, stats.size, stats.created, stats.modified ]
                        );
                    });
                    callback (undefined, 'file://' + newThumbPath, pad, stats);
                });
            });
        }

        self.processThumb (filepath, function (err, finalImage, stats) {
            if (err)
                return callback (err);

            // write the thumbnail data to disc and update the thumbnail database
            finalImage.writeFile (newThumbPath, 'png', function (err) {
                if (err)
                    return callback (err);
                var finalHeight = finalImage.height();
                if (finalHeight < THUMB_SIZE)
                    pad = Math.floor ((THUMB_SIZE - finalHeight) / 2);
                db.transaction (function (tx) {
                    tx.executeSql (
                        'INSERT OR REPLACE INTO images (directory, filename, thumbnail, pad, type, size, created, modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [ dirpath, filename, newThumbPath, pad||0, stats.type, stats.size, stats.created, stats.modified ]
                    );
                });
                callback (undefined, 'file://' + newThumbPath, pad, stats);
            });
        });
    });
};

ThumbWarrior.prototype.processThumb = function (filepath, callback) {
    var finalImage;
    var stats = {};
    async.parallel ([
        function (callback) {
            fs.readFile (filepath, function (err, buf) {
                if (err)
                    return callback (err);
                imageType = getType (buf);
                stats.type = imageType.ext;
                lwip.open (buf, imageType.ext, function (err, image) {
                    if (err)
                        return callback (err);
                    finalImage = image;

                    var width = image.width();
                    var height = image.height();

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
        if (err)
            return callback (err);
        callback (undefined, finalImage, stats);
    });
}

ThumbWarrior.prototype.processVideoThumb = function (filepath, callback) {
    var finalImage, thumbHeight;
    var stats = {};
    var self = this;
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
            vlc.events.on ('FrameReady', function (frame) {
                if (alreadyDone)
                    return;
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
        if (err)
            return callback (err, undefined, undefined, stats);
        callback (undefined, finalImage, thumbHeight, stats);
    });
}

ThumbWarrior.prototype.redoThumb = function (dirpath, filename, thumbPath, callback) {
    if (thumbPath)
        thumbPath = thumbPath.replace (/^file:\/\//, '');
    var image, stats;
    var self = this;
    async.parallel ([
        function (callback) {
            self.processThumb (path.join (dirpath, filename), function (err, finalImage, finalStats) {
                if (err)
                    return callback (err);
                image = finalImage;
                stats = finalStats;
                callback();
            });
        },
        function (callback) {
            if (thumbPath)
                return callback();
            uid (function (newID) {
                thumbPath = path.join (THUMBS_DIR, newID + '.png');
                callback();
            });
        }
    ], function (err) {
        if (err)
            return callback (err);

        // write the thumbnail data to disc and update the thumbnail database
        image.writeFile (thumbPath, 'png', function (err) {
            if (err)
                return callback (err);
            var finalHeight = image.height();
            if (finalHeight < THUMB_SIZE)
                var pad = Math.floor ((THUMB_SIZE - finalHeight) / 2);

            db.transaction (function (tx) {
                tx.executeSql (
                    'INSERT OR REPLACE INTO images (directory, filename, thumbnail, pad, type, size, created, modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [ dirpath, filename, thumbPath, pad, stats.type, stats.size, stats.created, stats.modified ]
                );
            });
            callback (undefined, 'file://' + thumbPath, pad, stats);
        });
    });
};

ThumbWarrior.prototype.redoVideoThumb = function (dirpath, filename, thumbPath, callback) {

};

ThumbWarrior.prototype.removeThumb = function (dirpath, filename, thumbPath) {

};
