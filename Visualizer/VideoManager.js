
var chimera = require ('wcjs-renderer');

// var RE_LEFT = /left:(-?\d+)px/;
module.exports = function (parentElem, filepath) {
    var document = parentElem.ownerDocument;
    parentElem.innerHTML = '<div id="VideoContainer"><canvas id="VideoCanvas" /></div>';
    var container = document.getElementById ('VideoContainer');
    var canvas = document.getElementById ('VideoCanvas');

    var vlc = chimera.init (canvas);
    vlc.play ('file:///' + filepath);

    vlc.events.once ('FrameReady', function (frame) {
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

    return vlc;
};
