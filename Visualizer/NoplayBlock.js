
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

function NoplayBlock (document, start, end) {
    this.elem = document.createElement ('div');
    this.elem.className = 'noplayBlock';

    var startHandle, endHandle;
    if (start) {
        this.start = start;
        startHandle = document.createElement ('div');
        startHandle.className = 'seekHandle startHandle';
        this.startSpan = document.createElement ('span');
        this.startSpan.textContent = toTimeStr (start);
        startHandle.appendChild (this.startSpan);
        startHandle.appendChild (document.createElement ('div'));
    } else {
        this.isFirst = true;
        this.elem.setAttribute ('id', 'StartBlock');
    }

    if (end) {
        this.end = end;
        endHandle = document.createElement ('div');
        endHandle.className = 'seekHandle endHandle';
        this.endSpan = document.createElement ('span');
        this.endSpan.textContent = toTimeStr (end);
        endHandle.appendChild (this.endSpan);
        endHandle.appendChild (document.createElement ('div'));
    } else {
        this.isLast = true;
        this.elem.setAttribute ('id', 'EndBlock');
    }
}
