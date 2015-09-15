
var Visualizer = require ('./Visualizer/Visualizer');
var Controller = require ('./Controller/Controller');

var VisualizerWindow = gui.Window.open ('./Visualizer/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornViewer',
    icon:           'icon.png'
});

var ControllerWindow = gui.Window.open ('./Controller/index.html', {
    toolbar:        false,
    frame:          false,
    transparent:    true,
    title:          'PornController',
    icon:           'icon.png'
});

var firstController = new Controller (ControllerWindow);
var firstVisualizer = new Visualizer (firstController, VisualizerWindow);
