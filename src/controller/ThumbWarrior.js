
var path = require ('path');
var fs = require ('fs');
var lwip = require ('lwip');
var uid = require ('infosex').uid.craft;
var async = require ('async');
var mkdirp = require ('mkdirp');
var getType = require ('image-type');

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
var CWD = process.cwd();
var THUMBS_DIR = path.join (gui.App.dataPath, 'thumbs');
mkdirp.sync (THUMBS_DIR);

/**     @property/Function getThumb

*/
module.exports.getThumb = function (dirpath, filename, callback) {
    if (!dbReady) {
        dbQueue.push (function(){ module.exports.getThumb (dirpath, filename, callback); });
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

        processThumb (filepath, function (err, finalImage, stats) {
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
                        [ dirpath, filename, newThumbPath, pad, stats.type, stats.size, stats.created, stats.modified ]
                    );
                });
                callback (undefined, 'file://' + newThumbPath, pad, stats);
            });
        });
    });
};

function processThumb (filepath, callback) {
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

module.exports.redoThumb = function (dirpath, filename, thumbPath, callback) {
    if (thumbPath)
        thumbPath = thumbPath.replace (/^file:\/\//, '');
    var image, stats;
    async.parallel ([
        function (callback) {
            processThumb (path.join (dirpath, filename), function (err, finalImage, finalStats) {
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

module.exports.removeThumb = function (dirpath, filename, thumbPath) {

};
