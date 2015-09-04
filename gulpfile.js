
var gulp = require ('gulp');
var zip = require ('gulp-zip');
var watch = require ('gulp-watch');

gulp.task('default', function(){
    gulp.watch ('src/**', [ 'default' ]);
    return gulp.src('src/**')
     .pipe (zip('package.zip', { compress:false }))
     .pipe (gulp.dest('./'))
     ;
});

gulp.task('once', function(){
    return gulp.src('src/**')
     .pipe (zip('package.zip', { compress:false }))
     .pipe (gulp.dest('./'))
     ;
});
