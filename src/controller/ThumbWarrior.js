
var path = require ('path');
var fs = require ('fs');
var lwip = require ('lwip');
var uid = require ('infosex').uid.craft;
var async = require ('async');
var mkdirp = require ('mkdirp');
var getType = require ('image-type');

/**     @module PornViewer:ThumbWarrior

*/
var dbReady = false, dbQueue = [];
var db = window.openDatabase ('pornviewer', '', 'image info', 10000 * 1024);
db.changeVersion (db.version, "1.2", function (tx) {
    tx.executeSql ('CREATE TABLE IF NOT EXISTS images (id unique, directory, filename, thumbnail, pad, type, size, created, Primary Key (id))');
    tx.executeSql ('CREATE UNIQUE INDEX IF NOT EXISTS directory ON images (directory, filename)');
    // tx.executeSql ('CREATE TABLE metadata (image, key, value, Foreign Key (image))');
    // tx.executeSql ('CREATE INDEX image ON metadata (image)');
}, function (err) {
    // database failure
    console.log ('db failed', err);
}, function(){
    console.log ('READY', db.version);
    dbReady = true;
    for (var i=0,j=dbQueue.length; i<j; i++)
        dbQueue[i]();
    delete dbQueue;
});

/**     @property/Function getThumb

*/
var ZOOM_INTO_MIN = 3 / 4;
var ZOOM_INTO_MAX = 4 / 3;
var MAX_CLIP = 0.20;
var THUMB_SIZE = 150;
var CWD = process.cwd();
var THUMBS_DIR = path.join (
    process.env.APPDATA || (
        process.platform == 'darwin' ?
            process.env.HOME + 'Library/Preference'
          : '/var/local'
    ),
    'PornViewer',
    'thumbs'
);
mkdirp.sync (THUMBS_DIR);

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
                        stats = { type:row.type, size:row.size, created:row.created };
                        callback();
                    }
                );
            });
        },
    ], function(){
        if (thumbPath)
            return callback (undefined, 'file://'+thumbPath, pad, stats);

        var finalImage;
        function writeNewThumb (err) {
            if (err)
                return callback (err);

            var width = finalImage.width();
            var height = finalImage.height();
            var finalHeight = finalImage.height();

            // write the thumbnail data to disc and update the thumbnail database
            finalImage.writeFile (newThumbPath, 'png', function (err) {
                if (err)
                    return callback (err);
                if (finalHeight < THUMB_SIZE)
                    pad = Math.floor ((THUMB_SIZE - finalHeight) / 2);
                db.transaction (function (tx) {
                    tx.executeSql (
                        'INSERT OR REPLACE INTO images (directory, filename, thumbnail, pad, type, size, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [ dirpath, filename, newThumbPath, pad, imageType.ext, stats.size, stats.created ]
                    );
                });
                callback (undefined, 'file://' + newThumbPath, pad, stats);
            });
        }

        stats = {};
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
                        srcImage = image;

                        var width = srcImage.width();
                        var height = srcImage.height();

                        if (width <= THUMB_SIZE && height <= THUMB_SIZE)
                            return callback();

                        if (width == height)
                            return srcImage.resize (150, 150, function (err, image) {
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
                        var batch = srcImage.batch()
                         // .crop (left, top, right, bottom)
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
                    callback();
                });
            }
        ], writeNewThumb);
    });
};
