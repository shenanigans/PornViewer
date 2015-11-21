
var RE_FNAME = /^(\d*)(.*?)(\d*)$/;
module.exports = function (able, baker) {
    able = RE_FNAME.exec (able.toLowerCase());
    baker = RE_FNAME.exec (baker.toLowerCase());

    // leading number
    if (able[1]) {
        if (!baker[1])
            return -1;
        aNum = Number (able[1]);
        bNum = Number (baker[1]);
        if (aNum < bNum)
            return -1;
        if (aNum > bNum)
            return 1;
    } else if (baker[1])
        return 1;

    // text portion
    if (able[2] < baker[2])
        return -1;
    if (able[2] > baker[2])
        return 1;

    // trailing number
    if (able[3]) {
        if (!baker[3])
            return -1;
        aNum = Number (able[3]);
        bNum = Number (baker[3]);
        if (aNum < bNum)
            return -1;
        if (aNum > bNum)
            return 1;
    } else if (baker[3])
        return 1;

    // identical filename(?!)
    return 0;
};
